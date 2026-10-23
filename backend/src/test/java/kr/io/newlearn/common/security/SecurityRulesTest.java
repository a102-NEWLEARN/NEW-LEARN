package kr.io.newlearn.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.authentication.logout.LogoutFilter;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.bind.annotation.RestController;

// 로그인 없이 여는 주소와 막는 주소 (docs/api.md 1절 「인증」, Jira 100). 로그인하지 않은 손님으로 부른다
// 실제 API 컨트롤러를 가져오지 않고 보안 규칙만 본다. 열린 주소는 보안을 통과해 404 NOT_FOUND다.
// @WebMvcTest 는 SecurityFilterChain 을 스스로 가져오지 않아 SecurityConfig 를 꼭 넣는다
@WebMvcTest(controllers = SecurityRulesTest.NoEndpoints.class)
@Import(SecurityConfig.class)
class SecurityRulesTest {

    @RestController
    static class NoEndpoints {}

    @Autowired
    MockMvc mockMvc;

    @Autowired
    SecurityFilterChain securityFilterChain;

    // 둘러보기(A1 ~ A9 · A13)와 용어사전(A19). /api/v1/categories 처럼 /** 앞 주소 자체도 열려야 한다
    @Test
    void browseApisAreOpenWithoutLogin() throws Exception {
        String[] paths = {
            "/api/v1/categories",
            "/api/v1/issues",
            "/api/v1/issues/12/timeline",
            "/api/v1/events/98/articles",
            "/api/v1/articles/456/mindmap",
            "/api/v1/search",
            "/api/v1/dictionary"
        };
        for (String path : paths) {
            mockMvc.perform(get(path))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("NOT_FOUND"));
        }
    }

    // 내 정보 · 관심 분야(A16 ~ A18)는 로그인이 필요하다. 오류 모양은 컨트롤러 오류와 같다
    @Test
    void memberApisNeedLogin() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/members/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.instance").value("/api/v1/members/me"))
                .andReturn();

        // 손님이 401 을 받을 때마다 세션이 생기지 않는다 (요청 저장을 껐다)
        assertThat(result.getRequest().getSession(false)).isNull();
    }

    // HTTP Basic · 로그인 폼 · /logout 을 껐는지는 응답으로 가려지지 않아 보안 필터 목록을 직접 본다
    // (켜 두면 스프링이 만든 임시 계정으로 Basic 로그인이 되고, POST /logout 이 열린다)
    @Test
    void builtInLoginAndLogoutAreOff() {
        assertThat(securityFilterChain.getFilters())
                .noneMatch(filter -> filter instanceof BasicAuthenticationFilter)
                .noneMatch(filter -> filter instanceof UsernamePasswordAuthenticationFilter)
                .noneMatch(filter -> filter instanceof LogoutFilter);
    }

    // 내부 API(/internal/v1) 인증 방식은 아직 못 정했다(SSOT.md 8절). 그때까지 막아 둔다
    @Test
    void internalApisStayLocked() throws Exception {
        mockMvc.perform(post("/internal/v1/articles/1/release").with(csrf()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    // 가입 · 로그인은 로그인 없이 부르지만 POST 라서 CSRF 번호표가 있어야 한다. 없으면 403
    @Test
    void signupWithoutCsrfTokenIsForbidden() throws Exception {
        mockMvc.perform(post("/api/v1/members")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isForbidden())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void signupAndLoginWithCsrfTokenPassSecurity() throws Exception {
        for (String path : new String[] {"/api/v1/members", "/api/v1/auth/login"}) {
            MvcResult result = mockMvc.perform(post(path)
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andReturn();
            assertThat(result.getResponse().getStatus()).as(path).isNotIn(401, 403);
        }
    }
}
