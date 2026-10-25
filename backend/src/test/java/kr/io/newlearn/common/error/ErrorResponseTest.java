package kr.io.newlearn.common.error;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Map;
import kr.io.newlearn.common.security.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// 모든 오류가 같은 모양(ProblemDetail + code)으로 나가는지 본다 (docs/api.md 2절, Jira 100)
// 아직 화면 API 가 없어서, 이 테스트 안에만 있는 시험용 컨트롤러(/probe)로 오류를 일부러 낸다
// @WithMockUser: 로그인 규칙(④ 보안)과 떼어 놓고 오류 모양만 본다
@WebMvcTest(controllers = ErrorResponseTest.ProbeController.class)
@Import({SecurityConfig.class, ErrorResponseTest.ProbeController.class})
@WithMockUser
class ErrorResponseTest {

    @Autowired
    MockMvc mockMvc;

    @Test
    void notFoundExceptionBecomes404WithCode() throws Exception {
        mockMvc.perform(get("/probe/articles/456"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("ARTICLE_NOT_FOUND"))
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.title").value("Not Found"))
                .andExpect(jsonPath("$.detail").value("기사를 찾을 수 없다: 456"))
                .andExpect(jsonPath("$.instance").value("/probe/articles/456"));
    }

    // 스프링이 내는 오류도 상태 이름을 code 로 붙인다 (2026-10-22)
    @Test
    void unknownPathIsNotFound() throws Exception {
        mockMvc.perform(get("/probe/nothing-here"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void wrongMethodIsMethodNotAllowed() throws Exception {
        mockMvc.perform(delete("/probe/articles/1").with(csrf()))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"));
    }

    @Test
    void unsupportedContentTypeIsRejected() throws Exception {
        mockMvc.perform(post("/probe/members")
                        .with(csrf())
                        .contentType(MediaType.TEXT_PLAIN)
                        .content("loginId=ab"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_MEDIA_TYPE"));
    }

    @Test
    void unacceptableResponseTypeIsRejected() throws Exception {
        mockMvc.perform(get("/probe/ok").accept(MediaType.APPLICATION_XML))
                .andExpect(status().isNotAcceptable())
                .andExpect(jsonPath("$.code").value("NOT_ACCEPTABLE"));
    }

    // 본문 검사(@Valid): reason 은 검증 어노테이션의 message 그대로 — 화면이 칸 옆에 보인다
    @Test
    void bodyValidationFillsErrorsWithKoreanReason() throws Exception {
        mockMvc.perform(post("/probe/members")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"loginId\": \"ab\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("loginId"))
                .andExpect(jsonPath("$.errors[0].reason").value("아이디는 4자 이상이에요"));
    }

    // 파라미터에 바로 붙은 제약은 다른 예외(HandlerMethodValidationException)로 오지만 모양은 같다
    @Test
    void paramConstraintFillsErrors() throws Exception {
        mockMvc.perform(get("/probe/sizes").param("size", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("size"))
                .andExpect(jsonPath("$.errors[0].reason").value("size 는 100 이하여야 해요"));
    }

    @Test
    void wrongTypeGetsKoreanReason() throws Exception {
        mockMvc.perform(get("/probe/sizes").param("size", "abc"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("size"))
                .andExpect(jsonPath("$.errors[0].reason").value("숫자로 보내 주세요"));
    }

    // 정해진 값(enum) 자리에 없는 값 — 예: A2 의 sort
    @Test
    void unknownChoiceGetsKoreanReason() throws Exception {
        mockMvc.perform(get("/probe/sorts").param("sort", "POPULAR"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("sort"))
                .andExpect(jsonPath("$.errors[0].reason").value("정해진 값 중 하나로 보내 주세요"));
    }

    @Test
    void missingParamGetsKoreanReason() throws Exception {
        mockMvc.perform(get("/probe/sizes"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("size"))
                .andExpect(jsonPath("$.errors[0].reason").value("꼭 보내야 하는 값이에요"));
    }

    // 본문 JSON 의 칸 타입이 틀리면 어느 칸인지 짚는다
    @Test
    void wrongTypeInBodyPointsToField() throws Exception {
        mockMvc.perform(post("/probe/members")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"loginId\": {\"nested\": 1}}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("loginId"))
                .andExpect(jsonPath("$.errors[0].reason").value("형식이 맞지 않아요"));
    }

    // JSON 자체가 깨지면 짚을 칸이 없어 errors 없이 나간다
    @Test
    void brokenJsonIsValidationFailed() throws Exception {
        mockMvc.perform(post("/probe/members")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors").doesNotExist());
    }

    // 예상 못 한 오류는 500 INTERNAL_ERROR. 원인(DB 정보 같은 내부 사정)은 응답에 싣지 않고 서버 로그에만 남긴다
    @Test
    void deniedInControllerBecomes403() throws Exception {
        mockMvc.perform(get("/probe/denied"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void unexpectedErrorHidesInternals() throws Exception {
        mockMvc.perform(get("/probe/boom"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                .andExpect(jsonPath("$.detail").value(not(containsString("secret"))));
    }

    @RestController
    @RequestMapping("/probe")
    static class ProbeController {

        @GetMapping("/articles/{articleId}")
        String article(@PathVariable long articleId) {
            throw new NotFoundException(ErrorCode.ARTICLE_NOT_FOUND, "기사를 찾을 수 없다: " + articleId);
        }

        @PostMapping("/members")
        String join(@Valid @RequestBody JoinRequest request) {
            return request.loginId();
        }

        @GetMapping("/sizes")
        int sizes(@RequestParam @Max(value = 100, message = "size 는 100 이하여야 해요") int size) {
            return size;
        }

        @GetMapping("/sorts")
        String sorts(@RequestParam Sort sort) {
            return sort.name();
        }

        @GetMapping("/ok")
        Map<String, String> ok() {
            return Map.of("ok", "yes");
        }

        // 권한 오류는 오류 처리기가 삼키지 않고 Security 에 넘겨 403 이 된다
        @GetMapping("/denied")
        String denied() {
            throw new AccessDeniedException("관리자만");
        }

        @GetMapping("/boom")
        String boom() {
            throw new IllegalStateException("DB 비밀번호 secret-value 로 붙지 못했다");
        }
    }

    enum Sort {
        LATEST,
        CREATED_AT
    }

    record JoinRequest(
            @NotBlank(message = "아이디를 입력해 주세요") @Size(min = 4, message = "아이디는 4자 이상이에요")
            String loginId) {}
}
