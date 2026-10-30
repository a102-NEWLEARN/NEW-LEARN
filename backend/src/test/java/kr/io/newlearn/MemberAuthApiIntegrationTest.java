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

import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

// 가입(A14) · 로그인(A15) · 로그아웃(A16) — 실제 PostgreSQL · Redis(세션) 위에서 (Jira 62, docs/api-screen.md A14 ~ A16)
// 시험마다 DB 는 되돌리고(@Transactional), 세션은 Redis 에 남지만 하루 뒤 만료된다. 실패 횟수 · 잠금 키는 시험마다 지운다
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class MemberAuthApiIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    StringRedisTemplate redis;

    // 같은 Redis 로 다시 돌려도 앞 시험의 실패 횟수 · 잠금이 남지 않게
    @AfterEach
    void forgetLoginAttempts() {
        redis.delete(redis.keys("login-*"));
    }

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

    // Set-Cookie 머리에서 쿠키 값만 — 다음 요청에 그 세션으로 붙인다
    static Cookie sessionCookie(MockHttpServletResponse response) {
        String header = sessionSetCookie(response);
        return new Cookie("SESSION", header.substring("SESSION=".length(), header.indexOf(';')));
    }

    static String loginBody(String loginId, String password) {
        return """
                {"loginId":"%s","password":"%s"}""".formatted(loginId, password);
    }

    ResultActions login(String loginId, String password, Cookie... cookies) throws Exception {
        var request = post("/api/v1/auth/login")
                .with(csrfToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(loginBody(loginId, password));
        if (cookies.length > 0) {
            request.cookie(cookies);
        }
        return mvc.perform(request);
    }

    ResultActions logout(Cookie... cookies) throws Exception {
        var request = post("/api/v1/auth/logout").with(csrfToken());
        if (cookies.length > 0) {
            request.cookie(cookies);
        }
        return mvc.perform(request);
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
    void signUpRejectsLongNameBlankPasswordAndPasswordOver72Bytes() throws Exception {
        // 이름은 세션에도 실려 하루 동안 Redis 에 남는다 — 20자까지
        signUp(signUpBody("reader_04", "password1", "가".repeat(21), "economy"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[?(@.field == 'name')].reason").value(hasItem("이름은 20자까지예요")));
        signUp(signUpBody("reader_04", "password1", "가".repeat(20), "economy")).andExpect(status().isCreated());
        // 공백만으로 된 비밀번호는 로그인에서 「비었음」이 되므로 가입에서 막는다
        signUp(signUpBody("reader_05", " ".repeat(8), "독자", "economy"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[*].field", contains("password")));
        // 64자 안이어도 UTF-8 로 72바이트를 넘으면 bcrypt 가 못 읽는다(한글 30자 = 90바이트)
        signUp(signUpBody("reader_06", "비".repeat(30), "독자", "economy"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[?(@.field == 'password')].reason").value(hasItem("비밀번호가 너무 길어요")));
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

    // 글자 U+0000 은 PostgreSQL 이 받지 못한다 — DB 에 닿기 전에 끊는다 (Jira 43 후속)
    // 이름은 저장되는 값이라 이유를 알려 준다. 막지 않으면 저장 오류가 아이디 중복 409 로 잘못 읽혔다
    @Test
    void signUpRejectsNulInName() throws Exception {
        signUp(signUpBody("reader_07", "password1", "독\\u0000자", "economy"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("name"))
                .andExpect(jsonPath("$.errors[0].reason").value("이름에 쓸 수 없는 글자가 들어 있어요"));
        assertThat(jdbc.sql("select count(*) from member where login_id = 'reader_07'")
                        .query(Integer.class)
                        .single())
                .isZero();
    }

    // 관심 분야 코드에 U+0000 이 들면 없는 코드와 같은 답이다. 전에는 findAllById 가 500 이었다 (Jira 43 후속)
    @Test
    void signUpRejectsNulInCategoryCodes() throws Exception {
        signUp(signUpBody("reader_09", "password1", "독자", "economy\\u0000"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("categoryCodes"))
                .andExpect(jsonPath("$.errors[0].reason").value("없는 관심 분야가 있어요"));
        assertThat(jdbc.sql("select count(*) from member where login_id = 'reader_09'")
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

    // ---- A15 로그인 · A16 로그아웃 · 실패 잠금 ----

    @Test
    void loginReturnsMemberAndIssuesNewSessionId() throws Exception {
        var joined = signUp(signUpBody("login_01", "password1", "독자", "world")).andReturn();
        Cookie before = sessionCookie(joined.getResponse());

        // 이미 세션이 있는 채로 로그인해도 세션 ID 를 새로 낸다(세션 고정 막기)
        var result = login("login_01", "password1", before)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.loginId").value("login_01"))
                .andExpect(jsonPath("$.name").value("독자"))
                .andExpect(jsonPath("$.categories[*].code", contains("world")))
                .andReturn();
        Cookie after = sessionCookie(result.getResponse());
        assertThat(after.getValue()).isNotEqualTo(before.getValue());
        // 로그인 상태가 바뀌어 새 번호표가 함께 온다
        assertThat(result.getResponse().getHeaders("Set-Cookie")).anyMatch(h -> h.startsWith("XSRF-TOKEN="));
    }

    @Test
    void sessionLivesInRedisForOneDay() throws Exception {
        var joined = signUp(signUpBody("login_02", "password1", "독자", "world")).andReturn();
        // 쿠키 값은 세션 ID 를 Base64 로 감싼 것이다(Spring Session 기본)
        String sessionId = new String(
                Base64.getDecoder().decode(sessionCookie(joined.getResponse()).getValue()), StandardCharsets.UTF_8);
        String key = "spring:session:sessions:" + sessionId;
        assertThat(redis.hasKey(key)).isTrue();
        assertThat(redis.getExpire(key, TimeUnit.SECONDS)).isBetween(86_000L, 86_400L);
    }

    @Test
    void wrongPasswordAndUnknownIdLookTheSame() throws Exception {
        signUp(signUpBody("login_03", "password1", "독자", "world")).andExpect(status().isCreated());
        String wrongPassword = login("login_03", "password2")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("LOGIN_FAILED"))
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        String unknownId = login("nobody_03", "password1")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("LOGIN_FAILED"))
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        // 어느 쪽이 틀렸는지 알려 주지 않는다 — 아이디를 빼면 본문이 같다
        assertThat(wrongPassword.replace("login_03", "")).isEqualTo(unknownId.replace("nobody_03", ""));
    }

    @Test
    void fiveFailuresLockTheLoginIdForOneMinute() throws Exception {
        signUp(signUpBody("login_04", "password1", "독자", "world")).andExpect(status().isCreated());
        for (int i = 0; i < 5; i++) {
            login("login_04", "wrong-pass").andExpect(status().isUnauthorized());
        }
        // 잠긴 동안은 비밀번호가 맞아도 429
        login("login_04", "password1")
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("TOO_MANY_REQUESTS"));
        assertThat(redis.getExpire("login-lock:login_04", TimeUnit.SECONDS)).isBetween(1L, 60L);

        // 1분이 지나 잠금 키가 사라지면 다시 된다(시간을 기다리는 대신 키를 지운다)
        redis.delete("login-lock:login_04");
        login("login_04", "password1").andExpect(status().isOk());
    }

    @Test
    void successResetsTheFailureCount() throws Exception {
        signUp(signUpBody("login_05", "password1", "독자", "world")).andExpect(status().isCreated());
        for (int i = 0; i < 4; i++) {
            login("login_05", "wrong-pass").andExpect(status().isUnauthorized());
        }
        login("login_05", "password1").andExpect(status().isOk());
        for (int i = 0; i < 4; i++) {
            login("login_05", "wrong-pass").andExpect(status().isUnauthorized());
        }
        login("login_05", "password1").andExpect(status().isOk());
    }

    @Test
    void unknownIdIsCountedTooSoNothingLeaks() throws Exception {
        for (int i = 0; i < 5; i++) {
            login("nobody_06", "wrong-pass").andExpect(status().isUnauthorized());
        }
        login("nobody_06", "wrong-pass").andExpect(status().isTooManyRequests());
    }

    // U+0000 이 든 아이디는 가입 규칙상 있을 수 없다 — DB 에 묻지 않고 없는 아이디와 같은 답, 실패 횟수도 센다 (Jira 43 후속)
    @Test
    void nulInLoginIdIsAnUnknownIdAndCounted() throws Exception {
        String unknownId = login("nobody_08", "password1")
                .andExpect(status().isUnauthorized())
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        for (int i = 0; i < 5; i++) {
            String withNul = login("nobody\\u0000_08", "password1")
                    .andExpect(status().isUnauthorized())
                    .andReturn()
                    .getResponse()
                    .getContentAsString(StandardCharsets.UTF_8);
            assertThat(withNul).isEqualTo(unknownId);
        }
        login("nobody\\u0000_08", "password1").andExpect(status().isTooManyRequests());
    }

    // 한꺼번에 보내도 비밀번호를 맞춰 보는 것은 5번까지 — 나머지는 비교 전에 429 (리뷰 2026-10-26)
    // 시험 트랜잭션 밖의 스레드에서 부르므로 DB 에 없는 아이디로 본다(없는 아이디도 똑같이 센다)
    @Test
    void concurrentAttemptsStillCompareAtMostFiveTimes() throws Exception {
        int requests = 20;
        ExecutorService pool = Executors.newFixedThreadPool(requests);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Integer>> statuses = IntStream.range(0, requests)
                    .mapToObj(i -> pool.submit(() -> {
                        start.await();
                        return login("race_08", "guess-" + i)
                                .andReturn()
                                .getResponse()
                                .getStatus();
                    }))
                    .toList();
            start.countDown();
            List<Integer> codes = new ArrayList<>();
            for (Future<Integer> status : statuses) {
                codes.add(status.get(60, TimeUnit.SECONDS));
            }
            assertThat(codes).filteredOn(code -> code == 401).hasSize(5);
            assertThat(codes).filteredOn(code -> code == 429).hasSize(requests - 5);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void loginRejectsMissingFields() throws Exception {
        mvc.perform(post("/api/v1/auth/login")
                        .with(csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"loginId\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[*].field", containsInAnyOrder("loginId", "password")));
    }

    @Test
    void logoutEndsTheSession() throws Exception {
        var joined = signUp(signUpBody("login_07", "password1", "독자", "world")).andReturn();
        Cookie session = sessionCookie(joined.getResponse());
        var loggedOut = logout(session).andExpect(status().isNoContent()).andReturn();
        // 로그인 상태가 바뀌어 새 번호표가 함께 온다
        assertThat(loggedOut.getResponse().getHeaders("Set-Cookie")).anyMatch(h -> h.startsWith("XSRF-TOKEN="));
        // 끝난 세션으로는 다시 로그아웃할 수 없다 — 로그인이 필요하다
        logout(session)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void logoutWithoutSessionIsUnauthorized() throws Exception {
        logout().andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }
}
