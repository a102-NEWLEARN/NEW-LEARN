package kr.io.newlearn.dictionary;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import kr.io.newlearn.common.web.ApiProblem;
import kr.io.newlearn.common.web.OpenApiConfig;
import kr.io.newlearn.dictionary.dto.MeaningRequest;
import kr.io.newlearn.dictionary.dto.MeaningResponse;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

// 손님도 부른다 — SecurityConfig 가 이 주소의 POST 를 따로 연다(2026-11-13 사용자, Jira 205). CSRF 번호표는 있어야 한다.
// 회원 정보는 쓰지 않는다 — 하루 한도 · 저장해 둔 답은 누가 불렀는지와 상관없다
@Tag(name = OpenApiConfig.TAG_DICTIONARY)
@RestController
public class MeaningController {
    private final MeaningService service;

    public MeaningController(MeaningService service) {
        this.service = service;
    }

    @Operation(
            summary = "[확정] A26 드래그한 말의 문맥 뜻",
            description = "기사 · 이슈 · 사건 화면에서 드래그한 말의 뜻을, 그 글의 문맥에 맞는 뜻 하나로 사전처럼 돌려줍니다(SSAFY GMS, AI 생성). "
                    + "로그인 없이 부르되 CSRF 번호표는 필요합니다. 고른 말은 around 안에, around 는 그 대상의 화면 글(기사 제목 · 마인드맵 잎, "
                    + "이슈 제목 · 요약, 사건 제목 · 이름 · 요약) 안에 있어야 합니다(공백을 뺀 NFC 로 비교). "
                    + "뜻 단위가 아니거나 문맥으로도 모르면 word · pos · definition 이 null 입니다. "
                    + "같은 대상의 같은 말은 하루 동안 저장해 둔 답을 줍니다. 검색 기록은 남기지 않습니다.")
    @ApiResponse(responseCode = "200", description = "성공")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED — term · around · contextType · contextId 가 규칙에 맞지 않거나, "
                    + "고른 말이 around 에 · around 가 그 대상의 글에 없음(errors[] 에 칸과 이유)",
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
            description = "ARTICLE_NOT_FOUND · ISSUE_NOT_FOUND · EVENT_NOT_FOUND — 없거나 숨긴 대상(각 화면의 404 와 같다)",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @ApiResponse(
            responseCode = "502",
            description =
                    "DICTIONARY_UNAVAILABLE — GMS 가 답하지 않거나 오류 · 읽을 수 없는 답을 줌, 키가 없음, " + "또는 그날 호출 한도를 넘었거나 셀 수 없음",
            content =
                    @Content(
                            mediaType = OpenApiConfig.PROBLEM_JSON,
                            schema = @Schema(implementation = ApiProblem.class)))
    @PostMapping("/api/v1/dictionary/meaning")
    public MeaningResponse explain(@RequestBody MeaningRequest request) {
        return service.explain(request);
    }
}
