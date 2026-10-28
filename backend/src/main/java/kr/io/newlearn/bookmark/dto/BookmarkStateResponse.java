package kr.io.newlearn.bookmark.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import org.jspecify.annotations.Nullable;

public record BookmarkStateResponse(
        long articleId,
        boolean bookmarked,

        @Schema(
                types = {"string", "null"},
                format = "date-time")
        @Nullable
        OffsetDateTime bookmarkedAt) {}
