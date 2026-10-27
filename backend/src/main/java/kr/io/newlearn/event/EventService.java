package kr.io.newlearn.event;

import java.util.List;
import kr.io.newlearn.article.ArticleRepository;
import kr.io.newlearn.article.ArticleSummaryAssembler;
import kr.io.newlearn.article.dto.ArticleSummaryResponse;
import kr.io.newlearn.article.dto.ArticleSummaryResponse.PublisherRef;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.NotFoundException;
import kr.io.newlearn.common.web.ApiTime;
import kr.io.newlearn.common.web.PageQuery;
import kr.io.newlearn.common.web.PageResponse;
import kr.io.newlearn.event.dto.EventPanelResponse;
import kr.io.newlearn.issue.dto.EventRef;
import kr.io.newlearn.issue.dto.IssueRef;
import org.jspecify.annotations.Nullable;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class EventService {
    private final EventRepository events;
    private final ArticleEventRepository links;
    private final ArticleRepository articles;
    private final ArticleSummaryAssembler summaries;

    public EventService(
            EventRepository events,
            ArticleEventRepository links,
            ArticleRepository articles,
            ArticleSummaryAssembler summaries) {
        this.events = events;
        this.links = links;
        this.articles = articles;
        this.summaries = summaries;
    }

    public EventPanelResponse get(long eventId) {
        var event = events.findWithIssueById(eventId).orElseThrow(() -> missing(eventId));
        var issue = event.getIssue();
        EventRef previous = null;
        EventRef next = null;
        if (issue != null) {
            var one = PageRequest.of(0, 1);
            previous = firstRef(events.findPrevious(issue.getId(), event.getOccurredAt(), eventId, one));
            next = firstRef(events.findNext(issue.getId(), event.getOccurredAt(), eventId, one));
        }
        return new EventPanelResponse(
                eventId,
                event.getTitle(),
                event.getLabel(),
                ApiTime.toKst(event.getOccurredAt()),
                event.getSummary(),
                event.getOccurredAtBasis(),
                issue == null ? null : new IssueRef(issue.getId(), issue.getTitle()),
                links.countReleasedArticles(eventId),
                links.findReleasedPublishers(eventId).stream()
                        .map(p -> new PublisherRef(p.getCode(), p.getName()))
                        .toList(),
                previous,
                next);
    }

    public PageResponse<ArticleSummaryResponse> articles(long eventId, PageQuery query) {
        if (!events.existsById(eventId)) throw missing(eventId);
        var pageable = query.toPageable(Sort.by(Sort.Direction.ASC, "publishedAt", "id"));
        var page = articles.findReleasedByEventId(eventId, pageable);
        return PageResponse.from(
                new PageImpl<>(summaries.assemble(page.getContent()), pageable, page.getTotalElements()));
    }

    private static @Nullable EventRef firstRef(List<Event> events) {
        if (events.isEmpty()) return null;
        var event = events.getFirst();
        return new EventRef(event.getId(), event.getTitle(), event.getLabel(), ApiTime.toKst(event.getOccurredAt()));
    }

    private static NotFoundException missing(long id) {
        return new NotFoundException(ErrorCode.EVENT_NOT_FOUND, "사건을 찾을 수 없다: " + id);
    }
}
