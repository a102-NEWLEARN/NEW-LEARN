package kr.io.newlearn.event;

import java.util.List;
import kr.io.newlearn.article.ArticleRepository;
import kr.io.newlearn.article.ArticleSummaryAssembler;
import kr.io.newlearn.article.dto.ArticleSummaryResponse;
import kr.io.newlearn.article.dto.ArticleSummaryResponse.PublisherRef;
import kr.io.newlearn.common.PublicEventThreshold;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.NotFoundException;
import kr.io.newlearn.common.web.ApiTime;
import kr.io.newlearn.common.web.PageQuery;
import kr.io.newlearn.common.web.PageResponse;
import kr.io.newlearn.event.dto.EventPanelResponse;
import kr.io.newlearn.issue.dto.EventRef;
import kr.io.newlearn.issue.dto.IssueRef;
import org.jspecify.annotations.Nullable;
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
    private final PublicEventThreshold threshold;

    public EventService(
            EventRepository events,
            ArticleEventRepository links,
            ArticleRepository articles,
            ArticleSummaryAssembler summaries,
            PublicEventThreshold threshold) {
        this.events = events;
        this.links = links;
        this.articles = articles;
        this.summaries = summaries;
        this.threshold = threshold;
    }

    public EventPanelResponse get(long eventId) {
        var event = events.findWithIssueById(eventId).orElseThrow(() -> missing(eventId));
        // 공개 기사가 하나도 없으면 없는 사건이다(docs/api.md 1절, Jira 179)
        long articleCount = links.countReleasedArticles(eventId);
        if (articleCount == 0) {
            throw missing(eventId);
        }
        var issue = event.getIssue();
        EventRef previous = null;
        EventRef next = null;
        if (issue != null) {
            var one = PageRequest.of(0, 1);
            int min = threshold.minArticles();
            previous = firstRef(events.findPrevious(issue.getId(), event.getOccurredAt(), eventId, min, one));
            next = firstRef(events.findNext(issue.getId(), event.getOccurredAt(), eventId, min, one));
        }
        return new EventPanelResponse(
                eventId,
                event.getTitle(),
                event.getLabel(),
                ApiTime.toKst(event.getOccurredAt()),
                event.getSummary(),
                event.getOccurredAtBasis(),
                issue == null ? null : IssueRef.from(issue),
                articleCount,
                links.findReleasedPublishers(eventId).stream()
                        .map(PublisherRef::from)
                        .toList(),
                previous,
                next);
    }

    // memberId 는 세션 회원, 손님이면 null (ArticleService.list 와 같은 까닭으로 손님용 짧은 판은 두지 않는다)
    // sort 는 컨트롤러가 거른 oldest · latest 다(A6). 같은 발행 시각은 id 가 같은 방향으로 순서를 정해 쪽이 안 섞인다
    public PageResponse<ArticleSummaryResponse> articles(
            long eventId, String sort, PageQuery query, @Nullable Long memberId) {
        var direction = "latest".equals(sort) ? Sort.Direction.DESC : Sort.Direction.ASC;
        var pageable = query.toPageable(Sort.by(direction, "publishedAt", "id"));
        var page = articles.findReleasedByEventId(eventId, pageable);
        // 전체 수 0 — 사건 번호가 없거나 공개 기사가 하나도 없는 사건이다. 쪽 번호가 넘친 것과는 구분된다(그때는 전체 수가 찬다)
        if (page.getTotalElements() == 0) {
            throw missing(eventId);
        }
        return PageResponse.of(page, summaries.assemble(page.getContent(), memberId));
    }

    private static @Nullable EventRef firstRef(List<Event> events) {
        return events.isEmpty() ? null : EventRef.from(events.getFirst());
    }

    private static NotFoundException missing(long id) {
        return new NotFoundException(ErrorCode.EVENT_NOT_FOUND, "사건을 찾을 수 없다: " + id);
    }
}
