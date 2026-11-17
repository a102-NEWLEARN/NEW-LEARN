package kr.io.newlearn.issue.dto;

import java.time.OffsetDateTime;
import java.util.List;
import kr.io.newlearn.category.dto.CategoryRef;
import org.jspecify.annotations.Nullable;

public record IssueHeaderResponse(
        long id,
        String title,
        @Nullable String summary,
        List<CategoryRef> categories,
        long eventCount,
        long articleCount,
        long publisherCount,
        @Nullable OffsetDateTime firstEventAt,
        @Nullable OffsetDateTime lastEventAt,
        OffsetDateTime createdAt,
        boolean interested) {}
