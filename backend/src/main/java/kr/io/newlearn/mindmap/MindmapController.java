package kr.io.newlearn.mindmap;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import kr.io.newlearn.common.web.ApiProblem;
import kr.io.newlearn.common.web.OpenApiConfig;
import kr.io.newlearn.mindmap.dto.MindmapResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = OpenApiConfig.TAG_ARTICLE)
@RestController
public class MindmapController {
    private final MindmapService service;

    public MindmapController(MindmapService service) {
        this.service = service;
    }

    @Operation(
            summary = "[확정] A9 기사 마인드맵",
            description = "가지(CORE 핵심 내용 · CAUSE 원인·배경 · REACTION 반응 · OUTLOOK 전망)와 잎을 줍니다. "
                    + "내용이 있는 가지만, 이 순서대로 옵니다. 가운데 글자는 AI 가 지은 제목이 없으면 기사 제목이고, 근거 문장은 내보내지 않습니다.")
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
            description = "ARTICLE_NOT_FOUND — 없거나 공개 전 기사 · MINDMAP_NOT_FOUND — 마인드맵 결과가 없음",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @GetMapping("/api/v1/articles/{articleId}/mindmap")
    public MindmapResponse get(
            @Parameter(description = "기사 ID (A7 항목의 id)", example = "1") @PathVariable long articleId) {
        return service.get(articleId);
    }
}
