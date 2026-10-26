package kr.io.newlearn.event.dto;

import java.time.OffsetDateTime;
import java.util.List;
import kr.io.newlearn.article.dto.ArticleSummaryResponse.PublisherRef;
import kr.io.newlearn.event.OccurredAtBasis;
import kr.io.newlearn.issue.dto.EventRef;
import kr.io.newlearn.issue.dto.IssueRef;

public record EventPanelResponse(
        long id,
        String title,
        String label,
        OffsetDateTime occurredAt,
        String summary,
        OccurredAtBasis occurredAtBasis,
        IssueRef issue,
        long articleCount,
        List<PublisherRef> publishers,
        EventRef previousEvent,
        EventRef nextEvent) {}
