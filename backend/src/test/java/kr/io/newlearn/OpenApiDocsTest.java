package kr.io.newlearn;

import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.emptyOrNullString;
import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

// Swagger 를 FE 가 읽기 좋게 — 한국어 태그, 명세대로 만들고 시험한 API 에 [확정], 인자 · 오류 설명 (Jira 112)
// 아직 없는 API 는 문서에 넣지 않는다. 확인한 API는 아래 CONFIRMED에 더한다
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class OpenApiDocsTest {

    // 경로 → 명세의 API 번호 (docs/api.md 3절)
    static final Map<String, String> CONFIRMED = Map.of(
            "/api/v1/categories", "A1",
            "/api/v1/issues", "A2",
            "/api/v1/issues/{issueId}", "A3",
            "/api/v1/issues/{issueId}/timeline", "A4",
            "/api/v1/events/{eventId}", "A5",
            "/api/v1/events/{eventId}/articles", "A6",
            "/api/v1/articles", "A7",
            "/api/v1/articles/{articleId}", "A8",
            "/api/v1/articles/{articleId}/mindmap", "A9",
            // Map.of 는 10쌍까지다 — 더 늘리면 Map.ofEntries 로 바꾼다
            "/api/v1/members/me", "A17");

    @Autowired
    MockMvc mvc;

    ResultActions docs() throws Exception {
        return mvc.perform(get("/v3/api-docs")).andExpect(status().isOk());
    }

    static String op(String path) {
        return op("get", path);
    }

    static String op(String method, String path) {
        return "$.paths['" + path + "']." + method;
    }

    @Test
    void tagsAreKoreanInScreenOrderAndLegendExplainsConfirmed() throws Exception {
        docs().andExpect(jsonPath("$.tags[0].name").value("카테고리"))
                .andExpect(jsonPath("$.tags[1].name").value("이슈"))
                .andExpect(jsonPath("$.tags[2].name").value("사건"))
                .andExpect(jsonPath("$.tags[3].name").value("기사"))
                .andExpect(jsonPath("$.tags[4].name").value("회원"))
                .andExpect(jsonPath("$.tags[3].description", not(emptyOrNullString())))
                .andExpect(jsonPath("$.tags[4].description", not(emptyOrNullString())))
                .andExpect(jsonPath("$.tags[0].description", not(emptyOrNullString())))
                .andExpect(jsonPath("$.tags[1].description", not(emptyOrNullString())))
                .andExpect(jsonPath("$.tags[2].description", not(emptyOrNullString())))
                .andExpect(jsonPath("$.info.description", containsString("[확정]")));
    }

    @Test
    void implementedOperationsAreMarkedConfirmedWithApiNumberAndTag() throws Exception {
        var result = docs();
        for (var entry : CONFIRMED.entrySet()) {
            result.andExpect(jsonPath(op(entry.getKey()) + ".summary", startsWith("[확정] " + entry.getValue() + " ")))
                    .andExpect(jsonPath(op(entry.getKey()) + ".tags[0]", not(emptyOrNullString())))
                    // 오류 응답을 적어도 성공 응답의 모양이 남아야 한다. 본문은 JSON 이다
                    .andExpect(jsonPath(op(entry.getKey()) + ".responses['200'].content['application/json']")
                            .exists());
        }
        result.andExpect(jsonPath(op("/api/v1/categories") + ".tags[0]").value("카테고리"))
                .andExpect(jsonPath(op("/api/v1/events/{eventId}") + ".tags[0]").value("사건"))
                .andExpect(jsonPath(op("/api/v1/events/{eventId}/articles") + ".tags[0]")
                        .value("사건"))
                .andExpect(jsonPath(op("/api/v1/issues/{issueId}/timeline") + ".tags[0]")
                        .value("이슈"))
                .andExpect(jsonPath(op("/api/v1/articles/{articleId}") + ".tags[0]")
                        .value("기사"));
    }

    @Test
    void listParametersAreFlattenedAndDescribed() throws Exception {
        var result = docs();
        for (String path : new String[] {"/api/v1/articles", "/api/v1/issues"}) {
            result.andExpect(jsonPath(op(path) + ".parameters[*].name", hasItems("category", "page", "size")))
                    .andExpect(jsonPath(op(path) + ".parameters[*].name", not(hasItem("query"))))
                    .andExpect(jsonPath(op(path) + ".parameters[?(!@.description)]")
                            .isEmpty())
                    // 명세(docs/api.md 1절)대로 숫자다
                    .andExpect(jsonPath(op(path) + ".parameters[?(@.name == 'page')].schema.type", hasItem("integer")))
                    .andExpect(jsonPath(op(path) + ".parameters[?(@.name == 'size')].schema.type", hasItem("integer")));
        }
        result.andExpect(jsonPath(op("/api/v1/issues") + ".parameters[*].name", hasItem("sort")))
                .andExpect(jsonPath(
                        op("/api/v1/events/{eventId}/articles") + ".parameters[*].name",
                        hasItems("eventId", "page", "size")))
                .andExpect(jsonPath(
                        op("/api/v1/events/{eventId}/articles") + ".parameters[*].name", not(hasItem("query"))))
                .andExpect(jsonPath(op("/api/v1/events/{eventId}/articles") + ".parameters[?(!@.description)]")
                        .isEmpty())
                .andExpect(jsonPath(
                        op("/api/v1/events/{eventId}/articles") + ".parameters[?(@.name == 'page')].schema.type",
                        hasItem("integer")))
                .andExpect(jsonPath(
                        op("/api/v1/events/{eventId}/articles") + ".parameters[?(@.name == 'size')].schema.type",
                        hasItem("integer")))
                .andExpect(jsonPath(op("/api/v1/articles/{articleId}") + ".parameters[?(!@.description)]")
                        .isEmpty());
    }

    @Test
    void errorResponsesAreDocumentedAsProblemDetails() throws Exception {
        var result = docs();
        for (String path : new String[] {"/api/v1/events/{eventId}", "/api/v1/events/{eventId}/articles"}) {
            result.andExpect(jsonPath(op(path) + ".responses['404'].description", containsString("EVENT_NOT_FOUND")))
                    .andExpect(jsonPath(op(path) + ".responses['400'].content['application/problem+json']")
                            .exists())
                    .andExpect(jsonPath(op(path) + ".responses['404'].content['application/problem+json']")
                            .exists());
        }
        for (String path : new String[] {"/api/v1/articles", "/api/v1/issues"}) {
            result.andExpect(jsonPath(op(path) + ".responses['400'].content['application/problem+json']")
                            .exists())
                    .andExpect(
                            jsonPath(op(path) + ".responses['404'].description", containsString("CATEGORY_NOT_FOUND")));
        }
        result.andExpect(jsonPath(
                        op("/api/v1/articles/{articleId}") + ".responses['404'].description",
                        containsString("ARTICLE_NOT_FOUND")))
                .andExpect(jsonPath(
                        op("/api/v1/issues/{issueId}") + ".responses['404'].description",
                        containsString("ISSUE_NOT_FOUND")))
                .andExpect(jsonPath(
                        op("/api/v1/issues/{issueId}/timeline") + ".responses['404'].description",
                        containsString("ISSUE_NOT_FOUND")))
                .andExpect(jsonPath(op("/api/v1/issues/{issueId}")
                                + ".responses['404'].content['application/problem+json']")
                        .exists())
                // A9 는 404 가 둘이다 — 기사가 없음과 결과가 없음
                .andExpect(jsonPath(
                        op("/api/v1/articles/{articleId}/mindmap") + ".responses['404'].description",
                        allOf(containsString("ARTICLE_NOT_FOUND"), containsString("MINDMAP_NOT_FOUND"))))
                .andExpect(jsonPath(op("/api/v1/articles/{articleId}/mindmap")
                                + ".responses['400'].content['application/problem+json']")
                        .exists());
        // 오류 본문의 모양은 실제 응답과 같아야 한다 — 화면이 가르는 code 와 칸별 errors 가 맨 위에 있다
        result.andExpect(jsonPath(
                        op("/api/v1/articles") + ".responses['400'].content['application/problem+json'].schema['$ref']",
                        endsWith("/Problem")))
                .andExpect(jsonPath(
                        op("/api/v1/articles/{articleId}")
                                + ".responses['404'].content['application/problem+json'].schema['$ref']",
                        endsWith("/Problem")))
                .andExpect(
                        jsonPath("$.components.schemas.Problem.properties.code").exists())
                .andExpect(jsonPath("$.components.schemas.Problem.properties.errors")
                        .exists())
                .andExpect(jsonPath("$.components.schemas.Problem.properties.properties")
                        .doesNotExist());
    }

    // 가입 · 로그인 · 로그아웃(A14 ~ A16, Jira 62) — 성공 응답과 오류 응답이 실제와 같다
    @Test
    void memberApisAreConfirmedWithTheirResponses() throws Exception {
        String signUp = op("post", "/api/v1/members");
        String login = op("post", "/api/v1/auth/login");
        String logout = op("post", "/api/v1/auth/logout");
        var result = docs();
        result.andExpect(jsonPath(signUp + ".summary", startsWith("[확정] A14 ")))
                .andExpect(jsonPath(login + ".summary", startsWith("[확정] A15 ")))
                .andExpect(jsonPath(logout + ".summary", startsWith("[확정] A16 ")));
        for (String operation : new String[] {signUp, login, logout}) {
            result.andExpect(jsonPath(operation + ".tags[0]").value("회원"));
        }
        result.andExpect(jsonPath(signUp + ".responses['201'].content['application/json']")
                        .exists())
                .andExpect(jsonPath(login + ".responses['200'].content['application/json']")
                        .exists())
                .andExpect(jsonPath(logout + ".responses['204']").exists());
        String[][] errors = {
            {signUp, "400"}, {signUp, "409"}, {login, "400"}, {login, "401"}, {login, "429"}, {logout, "401"}
        };
        for (String[] error : errors) {
            result.andExpect(jsonPath(
                    error[0] + ".responses['" + error[1] + "'].content['application/problem+json'].schema['$ref']",
                    endsWith("/Problem")));
        }
        result.andExpect(jsonPath(signUp + ".responses['409'].description", containsString("LOGIN_ID_TAKEN")))
                .andExpect(jsonPath(login + ".responses['401'].description", containsString("LOGIN_FAILED")))
                .andExpect(jsonPath(login + ".responses['429'].description", containsString("TOO_MANY_REQUESTS")));
    }

    @Test
    void memberProfileApisReuseMemberSchemaAndHidePrincipal() throws Exception {
        String profile = op("/api/v1/members/me");
        String change = op("put", "/api/v1/members/me/categories");
        var result = docs();
        result.andExpect(jsonPath(change + ".summary", startsWith("[확정] A18 ")))
                .andExpect(jsonPath(profile + ".parameters").doesNotExist())
                .andExpect(jsonPath(change + ".parameters").doesNotExist())
                .andExpect(jsonPath(change + ".requestBody.required").value(true))
                .andExpect(jsonPath(profile + ".tags[0]").value("회원"))
                .andExpect(jsonPath(change + ".tags[0]").value("회원"));
        for (String operation : new String[] {profile, change}) {
            result.andExpect(jsonPath(
                            operation + ".responses['200'].content['application/json'].schema['$ref']",
                            endsWith("/MemberResponse")))
                    .andExpect(jsonPath(operation + ".responses['401'].description", containsString("UNAUTHORIZED")))
                    .andExpect(jsonPath(
                            operation + ".responses['401'].content['application/problem+json'].schema['$ref']",
                            endsWith("/Problem")));
        }
        result.andExpect(jsonPath(change + ".responses['400'].description", containsString("VALIDATION_FAILED")))
                .andExpect(jsonPath(change + ".responses['403'].description", containsString("FORBIDDEN")))
                .andExpect(jsonPath(
                        change + ".responses['400'].content['application/problem+json'].schema['$ref']",
                        endsWith("/Problem")))
                .andExpect(jsonPath(
                        change + ".responses['403'].content['application/problem+json'].schema['$ref']",
                        endsWith("/Problem")));
    }
}
