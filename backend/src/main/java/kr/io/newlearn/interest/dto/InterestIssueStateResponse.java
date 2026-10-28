package kr.io.newlearn.interest.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import org.jspecify.annotations.Nullable;

public record InterestIssueStateResponse(
        long issueId,
        boolean interested,

        @Schema(
                types = {"string", "null"},
                format = "date-time")
        @Nullable
        OffsetDateTime interestedAt) {}
