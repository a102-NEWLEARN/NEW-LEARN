package kr.io.newlearn.event.dto;

import java.time.OffsetDateTime;
import java.util.List;
import kr.io.newlearn.article.dto.ArticleSummaryResponse.PublisherRef;
import kr.io.newlearn.event.OccurredAtBasis;
import kr.io.newlearn.issue.dto.EventRef;
import kr.io.newlearn.issue.dto.IssueRef;
import org.jspecify.annotations.Nullable;

public record EventPanelResponse(
        long id,
        String title,
        String label,
        OffsetDateTime occurredAt,
        @Nullable String summary,
        OccurredAtBasis occurredAtBasis,
        @Nullable IssueRef issue,
        long articleCount,
        List<PublisherRef> publishers,
        @Nullable EventRef previousEvent,
        @Nullable EventRef nextEvent) {}
