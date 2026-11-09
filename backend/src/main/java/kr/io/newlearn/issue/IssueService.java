package kr.io.newlearn.issue;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import kr.io.newlearn.category.CategoryFilter;
import kr.io.newlearn.category.CategoryRepository;
import kr.io.newlearn.category.dto.CategoryRef;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.NotFoundException;
import kr.io.newlearn.common.web.ApiTime;
import kr.io.newlearn.common.web.PageQuery;
import kr.io.newlearn.common.web.PageResponse;
import kr.io.newlearn.event.Event;
import kr.io.newlearn.event.EventRepository;
import kr.io.newlearn.interest.InterestIssueId;
import kr.io.newlearn.interest.InterestIssueRepository;
import kr.io.newlearn.issue.dto.IssueCardResponse;
import kr.io.newlearn.issue.dto.IssueHeaderResponse;
import kr.io.newlearn.issue.dto.TimelineEvent;
import kr.io.newlearn.issue.dto.TimelineResponse;
import org.jspecify.annotations.Nullable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class IssueService {
    private final CategoryRepository categories;
    private final IssueQueryRepository queries;
    private final EventRepository events;
    private final InterestIssueRepository interests;
    private final IssueCardAssembler cards;

    public IssueService(
            CategoryRepository categories,
            IssueQueryRepository queries,
            EventRepository events,
            InterestIssueRepository interests,
            IssueCardAssembler cards) {
        this.categories = categories;
        this.queries = queries;
        this.events = events;
        this.interests = interests;
        this.cards = cards;
    }

    public IssueHeaderResponse get(long issueId, @Nullable Long memberId) {
        var row = queries.findHeader(issueId).orElseThrow(() -> missingIssue(issueId));
        var refs = queries.findCategories(List.of(issueId)).stream()
                .map(c -> new CategoryRef(c.code(), c.name()))
                .toList();
        return new IssueHeaderResponse(
                row.id(),
                row.title(),
                row.summary(),
                refs,
                row.eventCount(),
                row.articleCount(),
                row.publisherCount(),
                ApiTime.toKst(row.firstEventAt()),
                ApiTime.toKst(row.lastEventAt()),
                ApiTime.toKst(row.createdAt()),
                memberId != null && interests.existsById(new InterestIssueId(memberId, issueId)));
    }

    public TimelineResponse timeline(long issueId) {
        // 공개 사건이 하나도 없으면 없는 이슈다(docs/api.md 1절, Jira 179)
        var ordered = events.findPublicByIssueId(issueId);
        if (ordered.isEmpty()) {
            throw missingIssue(issueId);
        }
        var ids = ordered.stream().map(Event::getId).toList();
        var counts = queries.findEventCounts(ids).stream()
                .collect(Collectors.toMap(IssueQueryRepository.EventCountRow::eventId, c -> c));
        // 반응 대상이 다른 이슈 · 이슈 밖 · 공개 기사가 없는 사건이면 이 타임라인에 그릴 수 없어 싣지 않는다. 이미 읽은 사건으로 가려 쿼리가 늘지 않는다
        var sameIssue = Set.copyOf(ids);
        return new TimelineResponse(
                issueId,
                ordered.stream()
                        .map(e -> {
                            var count = counts.getOrDefault(
                                    e.getId(), new IssueQueryRepository.EventCountRow(e.getId(), 0, 0));
                            @Nullable Long target = e.getReactsToEventId();
                            return new TimelineEvent(
                                    e.getId(),
                                    e.getTitle(),
                                    e.getLabel(),
                                    TimelineEvent.Lane.of(e.getRole()),
                                    target != null && sameIssue.contains(target) ? target : null,
                                    ApiTime.toKst(e.getOccurredAt()),
                                    e.getOccurredAtBasis(),
                                    count.articleCount(),
                                    count.publisherCount());
                        })
                        .toList());
    }

    private NotFoundException missingIssue(long issueId) {
        return new NotFoundException(ErrorCode.ISSUE_NOT_FOUND, "이슈를 찾을 수 없다: " + issueId);
    }

    public PageResponse<IssueCardResponse> list(
            @Nullable String category, String sort, PageQuery query, @Nullable Long memberId) {
        CategoryFilter.check(categories, category);
        var page = queries.findCards(category, sort, query.toPageable(Sort.unsorted()));
        if (page.isEmpty()) {
            return PageResponse.of(page, List.of());
        }
        var ids = page.stream().map(IssueQueryRepository.CardRow::id).toList();
        Set<Long> interested = memberId == null ? Set.of() : new HashSet<>(interests.findIssueIds(memberId, ids));
        return PageResponse.of(page, cards.assemble(page.getContent(), interested));
    }
}
