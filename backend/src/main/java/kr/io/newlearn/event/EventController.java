package kr.io.newlearn.event;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import kr.io.newlearn.article.dto.ArticleSummaryResponse;
import kr.io.newlearn.common.security.MemberPrincipal;
import kr.io.newlearn.common.web.ApiProblem;
import kr.io.newlearn.common.web.OpenApiConfig;
import kr.io.newlearn.common.web.PageQuery;
import kr.io.newlearn.common.web.PageResponse;
import kr.io.newlearn.event.dto.EventPanelResponse;
import org.jspecify.annotations.Nullable;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = OpenApiConfig.TAG_EVENT)
@RestController
public class EventController {
    private final EventService service;

    public EventController(EventService service) {
        this.service = service;
    }

    @Operation(
            summary = "[확정] A5 사건 패널",
            description = "저장된 사건 요약과 투입 기사 집계를 줍니다. 언론사는 코드 오름차순이며, 앞뒤 사건은 같은 이슈의 발생 시각·ID 순서입니다.")
    @ApiResponse(responseCode = "200", description = "성공")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED — eventId 가 숫자가 아님",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "404",
            description = "EVENT_NOT_FOUND — 없는 사건",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @GetMapping("/api/v1/events/{eventId}")
    public EventPanelResponse get(
            @Parameter(description = "사건 ID (A4 사건의 id)", example = "1") @PathVariable long eventId) {
        return service.get(eventId);
    }

    @Operation(
            summary = "[확정] A6 사건 관련 기사",
            description = "투입 기사만 발행 시각·ID 오름차순으로 줍니다. 처음 5건은 size=5 로 요청합니다. 기사 요약·상태는 A7·A8과 같습니다.")
    @ApiResponse(responseCode = "200", description = "성공")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED — eventId · page · size 가 숫자가 아니거나 page · size 범위를 벗어남",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "404",
            description = "EVENT_NOT_FOUND — 없는 사건",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @GetMapping("/api/v1/events/{eventId}/articles")
    public PageResponse<ArticleSummaryResponse> articles(
            @Parameter(description = "사건 ID (A5의 id)", example = "1") @PathVariable long eventId,
            @ParameterObject @Valid PageQuery query,
            @AuthenticationPrincipal @Nullable MemberPrincipal me) {
        return service.articles(eventId, query, me == null ? null : me.id());
    }
}
