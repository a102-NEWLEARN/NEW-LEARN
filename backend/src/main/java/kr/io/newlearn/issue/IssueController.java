package kr.io.newlearn.issue;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import kr.io.newlearn.common.web.OpenApiConfig;
import kr.io.newlearn.common.web.PageQuery;
import kr.io.newlearn.common.web.PageResponse;
import kr.io.newlearn.issue.dto.IssueCardResponse;
import kr.io.newlearn.issue.dto.IssueHeaderResponse;
import kr.io.newlearn.issue.dto.TimelineResponse;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = OpenApiConfig.TAG_ISSUE)
@RestController
public class IssueController {
    private final IssueService service;

    public IssueController(IssueService service) {
        this.service = service;
    }

    @Operation(summary = "[확정] A3 이슈 헤더", description = "이슈 화면 맨 위 헤더입니다. 사건이 0개인 이슈도 200 이고, 그때 수는 0 · 기간은 null 입니다.")
    @ApiResponse(responseCode = "200", description = "성공")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED — issueId 가 숫자가 아님",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ProblemDetail.class)))
    @ApiResponse(
            responseCode = "404",
            description = "ISSUE_NOT_FOUND — 없는 이슈",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ProblemDetail.class)))
    @GetMapping("/api/v1/issues/{issueId}")
    public IssueHeaderResponse get(
            @Parameter(description = "이슈 ID (A2 항목의 id)", example = "1") @PathVariable long issueId) {
        return service.get(issueId);
    }

    @Operation(
            summary = "[확정] A4 이슈 타임라인",
            description = "이슈의 사건을 페이지 없이 한 번에, 발생 시점 오름차순(같으면 id 오름차순)으로 줍니다. 사건이 0개면 events 는 빈 목록입니다.")
    @ApiResponse(responseCode = "200", description = "성공")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED — issueId 가 숫자가 아님",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ProblemDetail.class)))
    @ApiResponse(
            responseCode = "404",
            description = "ISSUE_NOT_FOUND — 없는 이슈",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ProblemDetail.class)))
    @GetMapping("/api/v1/issues/{issueId}/timeline")
    public TimelineResponse timeline(
            @Parameter(description = "이슈 ID (A2 항목의 id)", example = "1") @PathVariable long issueId) {
        return service.timeline(issueId);
    }

    @Operation(
            summary = "[확정] A2 이슈 목록",
            description = "카테고리별 이슈 목록 · 홈 이슈 카드 · 검색창 아래 「새로 생성된 이슈」(sort=createdAt)에 씁니다.")
    @ApiResponse(responseCode = "200", description = "성공")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED — page · size 가 범위를 벗어났거나 sort 가 정해진 값이 아님. errors[] 에 칸 이름과 이유",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ProblemDetail.class)))
    @ApiResponse(
            responseCode = "404",
            description = "CATEGORY_NOT_FOUND — 없는 카테고리 코드",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ProblemDetail.class)))
    @GetMapping("/api/v1/issues")
    public PageResponse<IssueCardResponse> list(
            @Parameter(description = "카테고리 코드(A1 의 code). 보내지 않으면 전체", example = "economy")
                    @RequestParam(required = false)
                    String category,
            @Parameter(
                            description = "정렬. lastEventAt(기본) 마지막 사건 최신순 · createdAt 이슈가 만들어진 최신순. 같으면 id 내림차순",
                            schema =
                                    @Schema(
                                            allowableValues = {"lastEventAt", "createdAt"},
                                            defaultValue = "lastEventAt"))
                    @RequestParam(required = false)
                    @Pattern(regexp = "lastEventAt|createdAt", message = "sort는 lastEventAt 또는 createdAt으로 보내 주세요")
                    String sort,
            @ParameterObject @Valid PageQuery query) {
        return service.list(category, sort == null ? "lastEventAt" : sort, query);
    }
}
