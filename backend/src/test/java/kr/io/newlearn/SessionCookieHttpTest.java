package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

// 세션 · 번호표 쿠키의 속성을 실제 서버(내장 Tomcat)로 부르며 본다 (Jira 62)
// 쿠키 속성은 서블릿 컨테이너가 application.yaml 의 server.servlet.session.cookie 로 정해서 MockMvc 로는 안 보인다
// 사이트와 같게 Secure 를 켠다(infra/k8s/services/app/backend.yaml 의 SESSION_COOKIE_SECURE=true)
@Import(TestcontainersConfiguration.class)
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "server.servlet.session.cookie.secure=true")
class SessionCookieHttpTest {

    static final String LOGIN_ID = "cookie_check";

    @LocalServerPort
    int port;

    @Autowired
    JdbcClient jdbc;

    final HttpClient http = HttpClient.newHttpClient();

    // 실제 서버라 시험 트랜잭션으로 되돌릴 수 없다 — 만든 회원을 지운다
    @AfterEach
    void removeMember() {
        jdbc.sql("delete from member_category where member_id in (select id from member where login_id = :id)")
                .param("id", LOGIN_ID)
                .update();
        jdbc.sql("delete from member where login_id = :id")
                .param("id", LOGIN_ID)
                .update();
    }

    @Test
    void sessionAndCsrfCookiesCarryTheirAttributes() throws Exception {
        // 첫 GET 의 응답에 번호표 쿠키 — 화면(axios)이 읽어야 해서 HttpOnly 가 아니다
        HttpResponse<Void> first = http.send(
                HttpRequest.newBuilder(uri("/api/v1/categories")).GET().build(),
                HttpResponse.BodyHandlers.discarding());
        String csrfCookie = setCookie(first, "XSRF-TOKEN=");
        assertThat(csrfCookie).contains("Secure", "SameSite=Lax").doesNotContain("HttpOnly");
        String token = csrfCookie.substring("XSRF-TOKEN=".length(), csrfCookie.indexOf(';'));

        HttpResponse<String> signUp = http.send(
                HttpRequest.newBuilder(uri("/api/v1/members"))
                        .header("Content-Type", "application/json")
                        .header("Cookie", "XSRF-TOKEN=" + token)
                        .header("X-XSRF-TOKEN", token)
                        .POST(HttpRequest.BodyPublishers.ofString("""
                                {"loginId":"%s","password":"password1","name":"cookie","categoryCodes":["economy"]}""".formatted(LOGIN_ID)))
                        .build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(signUp.statusCode()).as(signUp.body()).isEqualTo(201);

        // 세션 쿠키 — 자바스크립트가 못 읽고(HttpOnly), 다른 사이트에서 온 POST 에는 안 붙고(SameSite=Lax), https 로만(Secure).
        // 유효기간이 없는 브라우저 세션 쿠키라 브라우저를 닫으면 사라진다(2026-11-17 사용자 — 전에는 Max-Age 하루)
        assertThat(setCookie(signUp, "SESSION="))
                .contains("HttpOnly", "SameSite=Lax", "Secure")
                .doesNotContain("Max-Age", "Expires");
        // 로그인 상태가 바뀌어 번호표도 새로 왔다
        assertThat(setCookie(signUp, "XSRF-TOKEN=")).doesNotStartWith("XSRF-TOKEN=" + token + ";");
    }

    URI uri(String path) {
        return URI.create("http://localhost:" + port + path);
    }

    static String setCookie(HttpResponse<?> response, String prefix) {
        List<String> cookies = response.headers().allValues("Set-Cookie");
        return cookies.stream()
                .filter(cookie -> cookie.startsWith(prefix))
                .reduce((first, second) -> second) // 같은 이름이 둘이면 브라우저처럼 나중 것
                .orElseThrow(() -> new AssertionError(prefix + " 쿠키가 없다: " + cookies));
    }
}
