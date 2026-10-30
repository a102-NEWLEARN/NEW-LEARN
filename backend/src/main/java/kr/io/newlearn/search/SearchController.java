package kr.io.newlearn.search;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import kr.io.newlearn.common.web.ApiProblem;
import kr.io.newlearn.common.web.OpenApiConfig;
import kr.io.newlearn.search.dto.SearchResponse;
import org.jspecify.annotations.Nullable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// q 가 없을 때도 빈 q 와 같은 400 · errors[q] 이유를 주려고 required = false 로 받아 서비스가 검사한다(A19 와 같다)
@Tag(name = OpenApiConfig.TAG_SEARCH)
@RestController
public class SearchController {
    private final SearchService service;

    public SearchController(SearchService service) {
        this.service = service;
    }

    @Operation(
            summary = "[확정] A13 통합 검색",
            description = "제목에 검색어가 들어 있는 이슈 · 사건 · 기사를 유형별로 줍니다. 로그인 없이 부릅니다. "
                    + "대소문자를 가리지 않고, %, _ 같은 글자도 그대로 찾습니다. 요약 · 본문은 찾지 않습니다. "
                    + "사건은 이슈에 묶인 것만(issueId 로 그 이슈 타임라인을 엽니다), 기사는 공개된 것만 나옵니다. "
                    + "유형마다 최신순(이슈 만든 때 · 사건 발생 시점 · 기사 발행 시각) 20개까지이고, 없으면 빈 배열입니다.")
    @ApiResponse(responseCode = "200", description = "성공")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED — q 가 없거나 공백뿐이거나 50자를 넘거나 U+0000 이 들어 있음(errors[] 에 q 와 이유), "
                    + "또는 쿼리를 UTF-8 로 읽을 수 없음(errors 없음)",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @GetMapping("/api/v1/search")
    public SearchResponse search(
            @Parameter(description = "찾을 말. 앞뒤 공백을 지우고 50자까지", example = "예산") @RequestParam(required = false) @Nullable
                    String q) {
        return service.search(q);
    }
}
