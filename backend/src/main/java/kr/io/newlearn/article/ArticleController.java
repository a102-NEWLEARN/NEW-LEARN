package kr.io.newlearn.article;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import kr.io.newlearn.article.dto.ArticleDetailResponse;
import kr.io.newlearn.article.dto.ArticleSummaryResponse;
import kr.io.newlearn.common.web.ApiProblem;
import kr.io.newlearn.common.web.OpenApiConfig;
import kr.io.newlearn.common.web.PageQuery;
import kr.io.newlearn.common.web.PageResponse;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = OpenApiConfig.TAG_ARTICLE)
@RestController
public class ArticleController {
    private final ArticleService service;

    public ArticleController(ArticleService service) {
        this.service = service;
    }

    @Operation(
            summary = "[확정] A7 최신 기사",
            description = "투입된 기사를 발행 시각 최신순(같으면 id 내림차순)으로 줍니다. 요약은 우리 AI 요약만이고 없으면 null 입니다.")
    @ApiResponse(responseCode = "200", description = "성공")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED — page · size 가 숫자가 아니거나 범위를 벗어남. errors[] 에 칸 이름과 이유",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "404",
            description = "CATEGORY_NOT_FOUND — 없는 카테고리 코드 · 빈 문자열",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @GetMapping("/api/v1/articles")
    public PageResponse<ArticleSummaryResponse> list(
            @Parameter(description = "대표 카테고리 코드(A1 의 code). 보내지 않으면 전체", example = "economy")
                    @RequestParam(required = false)
                    String category,
            @ParameterObject @Valid PageQuery query) {
        return service.list(category, query);
    }

    @Operation(summary = "[확정] A8 기사 상세", description = "기사 요약 필드에 기자 · 사건 판정 상태 · 소속 사건 · 이슈를 더합니다. 본문은 내보내지 않습니다.")
    @ApiResponse(responseCode = "200", description = "성공")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED — articleId 가 숫자가 아님",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "404",
            description = "ARTICLE_NOT_FOUND — 없거나 아직 투입하지 않은 기사",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @GetMapping("/api/v1/articles/{articleId}")
    public ArticleDetailResponse get(
            @Parameter(description = "기사 ID (A7 항목의 id)", example = "1") @PathVariable long articleId) {
        return service.get(articleId);
    }
}
