package kr.io.newlearn;

import static kr.io.newlearn.common.security.TestCsrf.csrfToken;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Arrays;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

// 가입(A14) · 로그인(A15) · 로그아웃(A16) — 실제 PostgreSQL · Redis(세션) 위에서 (Jira 62, docs/api-screen.md A14 ~ A16)
// 시험마다 DB 는 되돌리고(@Transactional), 세션은 Redis 에 남지만 하루 뒤 만료된다
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class MemberAuthApiIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    static String signUpBody(String loginId, String password, String name, String... categoryCodes) {
        String codes = Arrays.stream(categoryCodes).map(c -> "\"" + c + "\"").collect(Collectors.joining(","));
        return """
                {"loginId":"%s","password":"%s","name":"%s","categoryCodes":[%s]}""".formatted(loginId, password, name, codes);
    }

    static String sessionSetCookie(MockHttpServletResponse response) {
        return response.getHeaders("Set-Cookie").stream()
                .filter(header -> header.startsWith("SESSION="))
                .findFirst()
                .orElseThrow(() -> new AssertionError("SESSION 쿠키가 없다: " + response.getHeaders("Set-Cookie")));
    }

    ResultActions signUp(String body) throws Exception {
        return mvc.perform(post("/api/v1/members")
                .with(csrfToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    @Test
    void signUpCreatesMemberAndOpensSession() throws Exception {
        var result = signUp(signUpBody("reader_01", "password1", "독자", "economy", "politics", "economy"))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/v1/members/me"))
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.loginId").value("reader_01"))
                .andExpect(jsonPath("$.name").value("독자"))
                // 같은 코드는 하나로 합치고, 카테고리 탭 순서(sort_order)로 준다
                .andExpect(jsonPath("$.categories[*].code", contains("politics", "economy")))
                .andExpect(jsonPath("$.categories[0].name").value("정치"))
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andReturn();

        // 가입하면 바로 로그인된 세션 쿠키가 온다. 쿠키 속성(HttpOnly · SameSite · Max-Age · Secure)은 실제 서버로 부르는
        // SessionCookieHttpTest 가 본다 — MockMvc 의 가짜 서블릿 환경에는 그 설정이 들어가지 않는다
        assertThat(sessionSetCookie(result.getResponse())).startsWith("SESSION=");

        // 비밀번호는 해시만 저장한다
        String hash = jdbc.sql("select password_hash from member where login_id = 'reader_01'")
                .query(String.class)
                .single();
        assertThat(hash).startsWith("{bcrypt}").doesNotContain("password1");
        assertThat(jdbc.sql("select count(*) from member_category mc join member m on m.id = mc.member_id"
                                + " where m.login_id = 'reader_01'")
                        .query(Integer.class)
                        .single())
                .isEqualTo(2);
    }

    @Test
    void signUpRejectsBrokenInputWithKoreanReasons() throws Exception {
        signUp(signUpBody("AB", "short", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath(
                        "$.errors[*].field", containsInAnyOrder("loginId", "password", "name", "categoryCodes")))
                .andExpect(jsonPath("$.errors[?(@.field == 'loginId')].reason")
                        .value(hasItem("아이디는 영문 소문자 · 숫자 · _ 로 4~20자여야 해요")))
                .andExpect(jsonPath("$.errors[?(@.field == 'password')].reason").value(hasItem("비밀번호는 8~64자여야 해요")))
                .andExpect(jsonPath("$.errors[?(@.field == 'name')].reason").value(hasItem("이름을 입력해 주세요")))
                .andExpect(jsonPath("$.errors[?(@.field == 'categoryCodes')].reason")
                        .value(hasItem("관심 분야를 1개 이상 골라 주세요")));
    }

    @Test
    void loginIdAllowsOnlyLowercaseDigitsAndUnderscoreFrom4To20() throws Exception {
        for (String bad : new String[] {"Reader01", "abc", "a".repeat(21), "독자독자", "read-er"}) {
            signUp(signUpBody(bad, "password1", "독자", "economy"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errors[*].field", contains("loginId")));
        }
        signUp(signUpBody("a_b1", "password1", "독자", "economy")).andExpect(status().isCreated());
        signUp(signUpBody("a".repeat(20), "password1", "독자", "economy")).andExpect(status().isCreated());
    }

    @Test
    void signUpRejectsUnknownCategoryAsValidationError() throws Exception {
        signUp(signUpBody("reader_02", "password1", "독자", "economy", "sports"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("categoryCodes"))
                .andExpect(jsonPath("$.errors[0].reason").value("없는 관심 분야가 있어요"));
        assertThat(jdbc.sql("select count(*) from member where login_id = 'reader_02'")
                        .query(Integer.class)
                        .single())
                .isZero();
    }

    @Test
    void signUpRejectsTakenLoginId() throws Exception {
        signUp(signUpBody("reader_03", "password1", "독자", "economy")).andExpect(status().isCreated());
        signUp(signUpBody("reader_03", "password2", "다른 독자", "world"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("LOGIN_ID_TAKEN"));
    }
}
