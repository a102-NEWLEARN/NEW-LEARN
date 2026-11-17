package kr.io.newlearn.dictionary;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import kr.io.newlearn.common.web.ApiProblem;
import kr.io.newlearn.common.web.OpenApiConfig;
import kr.io.newlearn.dictionary.dto.DictionaryResponse;
import org.jspecify.annotations.Nullable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// q 가 없을 때도 빈 q 와 같은 400 · errors[q] 이유를 주려고 required = false 로 받아 서비스가 검사한다
@Tag(name = OpenApiConfig.TAG_DICTIONARY)
@RestController
public class DictionaryController {
    private final DictionaryService service;

    public DictionaryController(DictionaryService service) {
        this.service = service;
    }

    @Operation(
            summary = "[확정] A19 용어사전",
            description = "단어 뜻을 국립국어원 표준국어대사전에서 찾아 줍니다. 로그인 없이 부릅니다. "
                    + "서버가 사전을 대신 불러 인증 키를 드러내지 않고, 검색 기록은 남기지 않습니다. "
                    + "표제어마다 첫 뜻풀이 하나가 항목 하나입니다. 품사가 없는 구 표제어는 pos 가 null 입니다. "
                    + "결과가 없으면 빈 items 입니다. 결과가 있는 검색어는 하루 동안 저장해 둔 결과를 줍니다.")
    @ApiResponse(responseCode = "200", description = "성공")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED — q 가 없거나 공백뿐이거나 50자를 넘거나 U+0000 이 들어 있음(errors[] 에 q 와 이유), "
                    + "또는 쿼리를 UTF-8 로 읽을 수 없음(errors 없음)",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "502",
            description = "DICTIONARY_UNAVAILABLE — 표준국어대사전이 답하지 않거나 오류 · 읽을 수 없는 응답을 줌, 인증 키가 없음, 또는 그날 사전 호출 한도를 넘음",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @GetMapping("/api/v1/dictionary")
    public DictionaryResponse search(
            @Parameter(description = "찾을 단어. 앞뒤 공백을 지우고 50자까지", example = "구원투수")
                    @RequestParam(required = false)
                    @Nullable
                    String q) {
        return service.search(q);
    }
}
