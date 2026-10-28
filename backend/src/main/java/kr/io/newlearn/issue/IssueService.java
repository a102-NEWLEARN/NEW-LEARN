package kr.io.newlearn.issue;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
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
    private final IssueRepository issues;
    private final EventRepository events;
    private final InterestIssueRepository interests;
    private final IssueCardAssembler cards;

    public IssueService(
            CategoryRepository categories,
            IssueQueryRepository queries,
            IssueRepository issues,
            EventRepository events,
            InterestIssueRepository interests,
            IssueCardAssembler cards) {
        this.categories = categories;
        this.queries = queries;
        this.issues = issues;
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
        if (!issues.existsById(issueId)) throw missingIssue(issueId);
        var ordered = events.findByIssue_IdOrderByOccurredAtAscIdAsc(issueId);
        if (ordered.isEmpty()) return new TimelineResponse(issueId, List.of());
        var counts = queries.findEventCounts(ordered.stream().map(Event::getId).toList()).stream()
                .collect(Collectors.toMap(IssueQueryRepository.EventCountRow::eventId, c -> c));
        return new TimelineResponse(
                issueId,
                ordered.stream()
                        .map(e -> {
                            var count = counts.getOrDefault(
                                    e.getId(), new IssueQueryRepository.EventCountRow(e.getId(), 0, 0));
                            return new TimelineEvent(
                                    e.getId(),
                                    e.getTitle(),
                                    e.getLabel(),
                                    TimelineEvent.Lane.of(e.getRole()),
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
            String category, String sort, PageQuery query, @Nullable Long memberId) {
        if (category != null && !categories.existsById(category)) {
            throw new NotFoundException(ErrorCode.CATEGORY_NOT_FOUND, "카테고리를 찾을 수 없다: " + category);
        }
        var page = queries.findCards(category, sort, query.toPageable(Sort.unsorted()));
        if (page.isEmpty()) {
            return new PageResponse<>(
                    List.of(), page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages());
        }
        var ids = page.stream().map(IssueQueryRepository.CardRow::id).toList();
        Set<Long> interested = memberId == null ? Set.of() : new HashSet<>(interests.findIssueIds(memberId, ids));
        return new PageResponse<>(
                cards.assemble(page.getContent(), interested),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages());
    }
}
