package kr.io.newlearn.issue;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.List;
import kr.io.newlearn.category.CategoryRepository;
import kr.io.newlearn.common.PublicEventThreshold;
import kr.io.newlearn.common.error.NotFoundException;
import kr.io.newlearn.common.web.PageQuery;
import kr.io.newlearn.event.EventRepository;
import kr.io.newlearn.interest.InterestIssueRepository;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

class IssueServiceTest {
    CategoryRepository categories = mock(CategoryRepository.class);
    IssueQueryRepository queries = mock(IssueQueryRepository.class);
    EventRepository events = mock(EventRepository.class);
    InterestIssueRepository interests = mock(InterestIssueRepository.class);
    IssueService service = new IssueService(
            categories, queries, events, interests, new IssueCardAssembler(queries), new PublicEventThreshold(1));

    @Test
    void missingIssueDoesNotReadCountsOrReferences() {
        assertThatThrownBy(() -> service.get(999, null)).isInstanceOf(NotFoundException.class);
        verify(queries, never()).findCategories(any());
        assertThatThrownBy(() -> service.timeline(999)).isInstanceOf(NotFoundException.class);
        verify(queries, never()).findEventCounts(any());
    }

    @Test
    void unknownCategoryStopsBeforeAggregate() {
        assertThatThrownBy(() -> service.list("unknown", "lastEventAt", new PageQuery(null, null), null))
                .isInstanceOf(NotFoundException.class);
        verifyNoInteractions(queries);
    }

    @Test
    void emptyPageDoesNotQueryReferences() {
        when(queries.findCards(isNull(), eq("lastEventAt"), any()))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));
        assertThat(service.list(null, "lastEventAt", new PageQuery(null, null), null)
                        .items())
                .isEmpty();
        verify(queries, never()).findCategories(any());
        verify(queries, never()).findLastEvents(any());
        verifyNoInteractions(interests);
    }

    // 조회 사이에 기사가 숨겨지면 최근 사건이 없을 수 있다 — 카드는 깨지지 않고 null 로 나간다(docs/api-screen.md A2)
    @Test
    void cardKeepsNullLastEventWhenItWasHiddenBetweenQueries() {
        Instant time = Instant.parse("2026-10-22T00:00:00Z");
        when(queries.findCards(isNull(), eq("lastEventAt"), any()))
                .thenReturn(new PageImpl<>(
                        List.of(new IssueQueryRepository.CardRow(1, "이슈", null, 1, 1, 1, time, time, time)),
                        PageRequest.of(0, 20),
                        1));
        when(queries.findLastEvents(List.of(1L))).thenReturn(List.of());
        var card = service.list(null, "lastEventAt", new PageQuery(null, null), null)
                .items()
                .getFirst();
        assertThat(card.lastEvent()).isNull();
    }

    @Test
    void bulkReferencesAndTimeAreMappedOnceForWholePage() {
        Instant time = Instant.parse("2026-10-22T00:00:00Z");
        when(queries.findCards(eq("politics"), eq("createdAt"), any()))
                .thenReturn(new PageImpl<>(
                        List.of(new IssueQueryRepository.CardRow(1, "이슈", null, 3, 2, 1, time, time, time)),
                        PageRequest.of(0, 20),
                        1));
        when(categories.existsById("politics")).thenReturn(true);
        when(queries.findCategories(List.of(1L)))
                .thenReturn(List.of(new IssueQueryRepository.CategoryRow(1, "politics", "정치")));
        when(queries.findLastEvents(List.of(1L)))
                .thenReturn(List.of(new IssueQueryRepository.EventRow(1, 3, "사건", "키워드", time)));
        var card = service.list("politics", "createdAt", new PageQuery(null, null), null)
                .items()
                .getFirst();
        assertThat(card.summary()).isNull();
        assertThat(card.lastEvent().id()).isEqualTo(3);
        assertThat(card.createdAt().toString()).isEqualTo("2026-10-22T09:00+09:00");
        assertThat(card.categories()).hasSize(1);
        verify(queries).findCategories(List.of(1L));
        verify(queries).findLastEvents(List.of(1L));
        assertThat(card.interested()).isFalse();
        verifyNoInteractions(interests);
    }
}
