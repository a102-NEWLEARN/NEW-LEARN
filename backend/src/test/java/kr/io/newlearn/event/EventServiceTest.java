package kr.io.newlearn.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import kr.io.newlearn.article.ArticleRepository;
import kr.io.newlearn.article.ArticleSummaryAssembler;
import kr.io.newlearn.common.PublicEventThreshold;
import kr.io.newlearn.common.error.NotFoundException;
import kr.io.newlearn.common.web.PageQuery;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

class EventServiceTest {
    @Test
    void missingEventStopsBeforeReadingCountsOrSummaries() {
        var events = mock(EventRepository.class);
        var links = mock(ArticleEventRepository.class);
        var articles = mock(ArticleRepository.class);
        var summaries = mock(ArticleSummaryAssembler.class);
        var service = new EventService(events, links, articles, summaries, new PublicEventThreshold(1, 1));
        when(articles.findReleasedByEventId(eq(49L), any())).thenReturn(Page.empty());
        assertThatThrownBy(() -> service.get(49)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.articles(49, "oldest", new PageQuery(0, 4), null))
                .isInstanceOf(NotFoundException.class);
        verifyNoInteractions(links, summaries);
    }

    @Test
    void sortPicksPublishedOrderDirectionWithIdAsTieBreaker() {
        var articles = mock(ArticleRepository.class);
        var service = new EventService(
                mock(EventRepository.class),
                mock(ArticleEventRepository.class),
                articles,
                mock(ArticleSummaryAssembler.class),
                new PublicEventThreshold(1, 1));
        when(articles.findReleasedByEventId(eq(49L), any())).thenReturn(Page.empty());
        var pageable = ArgumentCaptor.forClass(Pageable.class);

        assertThatThrownBy(() -> service.articles(49, "oldest", new PageQuery(0, 5), null));
        assertThatThrownBy(() -> service.articles(49, "latest", new PageQuery(1, 5), null));

        verify(articles, times(2)).findReleasedByEventId(eq(49L), pageable.capture());
        assertThat(pageable.getAllValues().get(0).getSort())
                .isEqualTo(Sort.by(Sort.Direction.ASC, "publishedAt", "id"));
        assertThat(pageable.getAllValues().get(1).getSort())
                .isEqualTo(Sort.by(Sort.Direction.DESC, "publishedAt", "id"));
        assertThat(pageable.getAllValues().get(1).getPageNumber()).isEqualTo(1);
    }
}
