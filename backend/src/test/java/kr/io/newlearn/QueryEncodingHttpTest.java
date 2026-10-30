package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 쿼리 인자를 UTF-8 로 읽지 못하면 400 VALIDATION_FAILED 이고 errors 는 없다 (docs/api.md 2절)
// Tomcat 이 인자를 읽다 던지는 오류라 실제 서버(내장 Tomcat)로 부른다 — MockMvc 는 쿼리를 UTF-8 로 미리 풀어 재현되지 않는다
// SessionCookieHttpTest 와 설정을 똑같이 둬 띄운 서버(DB · Redis 컨테이너 포함)를 같이 쓴다
@Import(TestcontainersConfiguration.class)
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "server.servlet.session.cookie.secure=true")
class QueryEncodingHttpTest {

    static final JsonMapper JSON = JsonMapper.builder().build();

    @LocalServerPort
    int port;

    final HttpClient http = HttpClient.newHttpClient();

    // %B3%AA%B9%AB 는 cp949 로 인코딩한 「나무」다 — Windows Git Bash 의 curl --data-urlencode 가 이렇게 보냈다(2026-10-29)
    // 전에는 500 INTERNAL_ERROR 와 ERROR 스택 로그였다. %ZZ 같은 깨진 퍼센트는 java.net.URI 가 보내기 전에 막아 여기서는 못 본다
    @ParameterizedTest
    @ValueSource(strings = {"/api/v1/search?q=%B3%AA%B9%AB", "/api/v1/dictionary?q=%B3%AA%B9%AB"})
    void unreadableQueryIs400(String pathAndQuery) throws Exception {
        HttpResponse<String> response = http.send(
                HttpRequest.newBuilder(URI.create("http://localhost:" + port + pathAndQuery))
                        .GET()
                        .build(),
                HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(response.headers().firstValue("Content-Type")).hasValue("application/problem+json");
        JsonNode body = JSON.readTree(response.body());
        assertThat(body.path("code").asString()).isEqualTo("VALIDATION_FAILED");
        // 어느 인자인지는 Tomcat 이 메시지 글자로만 알려 줘 짚지 않는다(깨진 JSON 과 같다)
        assertThat(body.has("errors")).isFalse();
    }

    // 카테고리 코드에 U+0000 이 들면 없는 코드와 같은 404 다. PostgreSQL 이 이 글자를 받지 못해 전에는 500 이었다 (Jira 43 후속)
    // MockMvc 도 %00 을 풀어 주지만, 실제 Tomcat 을 지나도 같은지 여기서 본다
    @ParameterizedTest
    @ValueSource(
            strings = {
                "/api/v1/issues?category=%00",
                "/api/v1/issues?category=politics%00",
                "/api/v1/articles?category=%00"
            })
    void nulInCategoryIs404(String pathAndQuery) throws Exception {
        HttpResponse<String> response = http.send(
                HttpRequest.newBuilder(URI.create("http://localhost:" + port + pathAndQuery))
                        .GET()
                        .build(),
                HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).as(response.body()).isEqualTo(404);
        assertThat(JSON.readTree(response.body()).path("code").asString()).isEqualTo("CATEGORY_NOT_FOUND");
    }
}
