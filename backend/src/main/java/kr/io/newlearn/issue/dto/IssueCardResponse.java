package kr.io.newlearn.issue.dto;

import java.time.OffsetDateTime;
import java.util.List;
import kr.io.newlearn.category.dto.CategoryRef;
import org.jspecify.annotations.Nullable;

public record IssueCardResponse(
        long id,
        String title,
        String summary,
        List<CategoryRef> categories,
        long eventCount,
        long articleCount,
        long publisherCount,
        OffsetDateTime firstEventAt,
        OffsetDateTime lastEventAt,
        OffsetDateTime createdAt,
        @Nullable EventRef lastEvent) {}
