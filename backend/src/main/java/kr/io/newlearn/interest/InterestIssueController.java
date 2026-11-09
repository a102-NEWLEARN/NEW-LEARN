package kr.io.newlearn.interest;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import kr.io.newlearn.common.security.MemberPrincipal;
import kr.io.newlearn.common.web.ApiProblem;
import kr.io.newlearn.common.web.OpenApiConfig;
import kr.io.newlearn.interest.dto.InterestIssueListResponse;
import kr.io.newlearn.interest.dto.InterestIssueStateResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = OpenApiConfig.TAG_MEMBER)
public class InterestIssueController {
    private final InterestIssueService service;

    public InterestIssueController(InterestIssueService service) {
        this.service = service;
    }

    @Operation(
            summary = "[확정] A23 관심 이슈 저장",
            description = "본문 없이 저장합니다. 반복·동시 요청도 최초 저장 시각을 유지합니다. 공개 기사가 하나도 없는 이슈는 404 입니다.")
    @ApiResponse(responseCode = "200", description = "성공")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED — issueId가 숫자가 아님",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "401",
            description = "UNAUTHORIZED — 로그인 필요",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "403",
            description = "FORBIDDEN — CSRF 번호표가 없거나 틀림",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "404",
            description = "ISSUE_NOT_FOUND — 없는 이슈 · 공개 기사가 하나도 없는 이슈",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @PutMapping("/api/v1/members/me/interest-issues/{issueId}")
    public InterestIssueStateResponse add(
            @Parameter(hidden = true) @AuthenticationPrincipal MemberPrincipal me,
            @Parameter(description = "이슈 ID", example = "12") @PathVariable long issueId) {
        return service.add(me.id(), issueId);
    }

    @Operation(summary = "[확정] A24 관심 이슈 해제", description = "본문 없이 해제합니다. 저장하지 않았거나 없는 이슈도 200·false·null입니다.")
    @ApiResponse(responseCode = "200", description = "성공")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED — issueId가 숫자가 아님",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "401",
            description = "UNAUTHORIZED — 로그인 필요",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "403",
            description = "FORBIDDEN — CSRF 번호표가 없거나 틀림",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @DeleteMapping("/api/v1/members/me/interest-issues/{issueId}")
    public InterestIssueStateResponse remove(
            @Parameter(hidden = true) @AuthenticationPrincipal MemberPrincipal me,
            @Parameter(description = "이슈 ID", example = "12") @PathVariable long issueId) {
        return service.remove(me.id(), issueId);
    }

    @Operation(
            summary = "[확정] A25 관심 이슈 목록",
            description = "쪽 없이 전체 목록을 저장 시각·이슈 ID 내림차순으로 줍니다. 공개 기사가 하나도 없는 이슈는 빠지고, 저장은 남아 다시 공개되면 돌아옵니다.")
    @ApiResponse(responseCode = "200", description = "성공")
    @ApiResponse(
            responseCode = "401",
            description = "UNAUTHORIZED — 로그인 필요",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @GetMapping("/api/v1/members/me/interest-issues")
    public InterestIssueListResponse list(@Parameter(hidden = true) @AuthenticationPrincipal MemberPrincipal me) {
        return service.list(me.id());
    }
}
