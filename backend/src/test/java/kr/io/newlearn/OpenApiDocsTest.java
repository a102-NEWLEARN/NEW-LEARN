package kr.io.newlearn;

import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.emptyOrNullString;
import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import kr.io.newlearn.common.web.OpenApiConfig;
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
    static final Map<String, String> CONFIRMED = Map.ofEntries(
            Map.entry("/api/v1/categories", "A1"),
            Map.entry("/api/v1/issues", "A2"),
            Map.entry("/api/v1/issues/{issueId}", "A3"),
            Map.entry("/api/v1/issues/{issueId}/timeline", "A4"),
            Map.entry("/api/v1/events/{eventId}", "A5"),
            Map.entry("/api/v1/events/{eventId}/articles", "A6"),
            Map.entry("/api/v1/articles", "A7"),
            Map.entry("/api/v1/articles/{articleId}", "A8"),
            Map.entry("/api/v1/articles/{articleId}/mindmap", "A9"),
            Map.entry("/api/v1/members/me", "A17"),
            Map.entry("/api/v1/members/me/bookmarks", "A22"),
            Map.entry("/api/v1/members/me/interest-issues", "A25"),
            Map.entry("/api/v1/dictionary", "A19"));

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

    static final String PROBLEM = OpenApiConfig.PROBLEM_JSON;

    static String problemExample(String operation, String code) {
        return operation + ".responses['" + code + "'].content['" + PROBLEM + "'].example";
    }

    @Test
    void tagsAreKoreanInScreenOrderAndLegendExplainsConfirmed() throws Exception {
        docs().andExpect(jsonPath("$.tags[0].name").value("카테고리"))
                .andExpect(jsonPath("$.tags[1].name").value("이슈"))
                .andExpect(jsonPath("$.tags[2].name").value("사건"))
                .andExpect(jsonPath("$.tags[3].name").value("기사"))
                .andExpect(jsonPath("$.tags[4].name").value("회원"))
                .andExpect(jsonPath("$.tags[5].name").value("용어사전"))
                .andExpect(jsonPath("$.tags[3].description", not(emptyOrNullString())))
                .andExpect(jsonPath("$.tags[4].description", not(emptyOrNullString())))
                .andExpect(jsonPath("$.tags[5].description", not(emptyOrNullString())))
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

    // 오류 예시는 응답 코드마다 그 상태와 code 로 보인다 — Problem 칸에 예시를 박으면 404 아래에도 400 이 보인다
    @Test
    void errorExamplesMatchTheirResponseCode() throws Exception {
        var result = docs();
        result.andExpect(jsonPath("$.components.schemas.Problem.properties.title.example")
                        .doesNotExist())
                .andExpect(jsonPath("$.components.schemas.Problem.properties.status.example")
                        .doesNotExist())
                .andExpect(jsonPath("$.components.schemas.Problem.properties.code.example")
                        .doesNotExist());
        for (int code : new int[] {400, 401, 403, 404, 409, 429, 502}) {
            String content = "$.paths.*.*.responses['" + code + "'].content['" + PROBLEM + "']";
            result.andExpect(jsonPath(content + ".example.status", everyItem(is(code))))
                    .andExpect(jsonPath(content + ".examples.*.value.status", everyItem(is(code))))
                    // 예시가 빠진 오류 응답이 없다
                    .andExpect(
                            jsonPath(content + "[?(!@.example && !@.examples)]").isEmpty());
        }
        String article = problemExample(op("/api/v1/articles/{articleId}"), "404");
        String profile = problemExample(op("/api/v1/members/me"), "401");
        String signUp = problemExample(op("post", "/api/v1/members"), "409");
        String login = problemExample(op("post", "/api/v1/auth/login"), "429");
        String change = problemExample(op("put", "/api/v1/members/me/categories"), "403");
        String list = problemExample(op("/api/v1/articles"), "400");
        result.andExpect(jsonPath(article + ".title").value("Not Found"))
                .andExpect(jsonPath(article + ".status").value(404))
                .andExpect(jsonPath(article + ".code").value("ARTICLE_NOT_FOUND"))
                // 주소의 {articleId} 는 인자 예시로 채운다
                .andExpect(jsonPath(article + ".instance").value("/api/v1/articles/1"))
                .andExpect(jsonPath(profile + ".code").value("UNAUTHORIZED"))
                .andExpect(jsonPath(signUp + ".code").value("LOGIN_ID_TAKEN"))
                .andExpect(jsonPath(login + ".code").value("TOO_MANY_REQUESTS"))
                .andExpect(jsonPath(change + ".code").value("FORBIDDEN"))
                .andExpect(jsonPath(list + ".code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath(list + ".instance").value("/api/v1/articles"));
        // A9 의 404 는 code 가 둘이라 예시도 둘이다
        String mindmap = op("/api/v1/articles/{articleId}/mindmap") + ".responses['404'].content['" + PROBLEM + "']";
        result.andExpect(jsonPath(mindmap + ".examples.ARTICLE_NOT_FOUND.value.code")
                        .value("ARTICLE_NOT_FOUND"))
                .andExpect(jsonPath(mindmap + ".examples.MINDMAP_NOT_FOUND.value.code")
                        .value("MINDMAP_NOT_FOUND"))
                .andExpect(jsonPath(mindmap + ".example").doesNotExist());
    }

    // 기사는 분석 결과가 처음 저장된 뒤부터 보인다 — 투입만 하고 결과가 없어도 404 (docs/api.md 1절 「공개 전 기사」, Jira 34)
    @Test
    void articleNotFoundSaysNotYetPublic() throws Exception {
        var result = docs();
        for (String path : new String[] {"/api/v1/articles/{articleId}", "/api/v1/articles/{articleId}/mindmap"}) {
            result.andExpect(jsonPath(op(path) + ".responses['404'].description", containsString("없거나 공개 전 기사")))
                    .andExpect(jsonPath(op(path) + ".responses['404'].description", not(containsString("투입"))));
        }
    }

    // 상태 enum 하나를 두 칸이 같이 쓴다 — 칸마다 실제로 나오는 값만 보인다 (docs/api-screen.md A7 · A8 표)
    @Test
    void analysisStatusFieldsListOnlyTheirOwnValues() throws Exception {
        String[] mindmap = {"NONE", "QUEUED", "SUCCEEDED", "FAILED", "NOT_ANALYZABLE"};
        String[] eventMatch = {"NONE", "QUEUED", "SUCCEEDED", "FAILED", "NO_EVENT"};
        String summary = "$.components.schemas.ArticleSummaryResponse.properties";
        String detail = "$.components.schemas.ArticleDetailResponse.properties";
        docs().andExpect(jsonPath(summary + ".mindmapStatus.enum", containsInAnyOrder(mindmap)))
                .andExpect(jsonPath(detail + ".mindmapStatus.enum", containsInAnyOrder(mindmap)))
                .andExpect(jsonPath(detail + ".eventMatchStatus.enum", containsInAnyOrder(eventMatch)));
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

    @Test
    void bookmarkApisHaveConfirmedMemberTagResponsesAndNoBodyOrPrincipal() throws Exception {
        var result = docs();
        String path = "/api/v1/members/me/bookmarks/{articleId}";
        for (String method : new String[] {"put", "delete"}) {
            String operation = op(method, path);
            // 요약 이름은 docs/api.md 3절과 같게 — 「북마크 담기 · 빼기」
            result.andExpect(jsonPath(operation + ".summary")
                            .value("[확정] " + (method.equals("put") ? "A20 북마크 담기" : "A21 북마크 빼기")))
                    .andExpect(jsonPath(operation + ".tags[0]").value("회원"))
                    .andExpect(jsonPath(operation + ".requestBody").doesNotExist())
                    .andExpect(jsonPath(operation + ".parameters[*].name", org.hamcrest.Matchers.contains("articleId")))
                    .andExpect(jsonPath(
                            operation + ".responses['200'].content['application/json'].schema['$ref']",
                            endsWith("/BookmarkStateResponse")));
            for (String code : new String[] {"400", "401", "403"}) {
                result.andExpect(jsonPath(
                        operation + ".responses['" + code + "'].content['application/problem+json'].schema['$ref']",
                        endsWith("/Problem")));
            }
        }
        result.andExpect(jsonPath(
                        op("put", path) + ".responses['404'].description", containsString("ARTICLE_NOT_FOUND")))
                .andExpect(jsonPath(op("put", path) + ".responses['404'].content['application/problem+json']")
                        .exists())
                .andExpect(jsonPath(op("delete", path) + ".responses['404']").doesNotExist())
                .andExpect(jsonPath(op("/api/v1/members/me/bookmarks") + ".parameters")
                        .doesNotExist())
                .andExpect(jsonPath(op("/api/v1/members/me/bookmarks") + ".tags[0]")
                        .value("회원"))
                .andExpect(jsonPath(op("/api/v1/members/me/bookmarks")
                                + ".responses['401'].content['application/problem+json']")
                        .exists())
                .andExpect(jsonPath(
                        "$.components.schemas.BookmarkStateResponse.properties.bookmarkedAt.type",
                        hasItems("string", "null")))
                .andExpect(jsonPath("$.components.schemas.ArticleSummaryResponse.properties.bookmarked.type")
                        .value("boolean"))
                // springdoc 은 스키마 이름을 단순 클래스 이름으로 짓는다 — 중첩 record 를 Item 으로 두면 같은 모양의
                // 관심 이슈 목록(A25, Jira 64)과 이름이 겹쳐 한쪽이 덮인다
                .andExpect(jsonPath("$.components.schemas.BookmarkItem.properties.bookmarkedAt")
                        .exists())
                .andExpect(jsonPath("$.components.schemas.Item").doesNotExist());
    }

    // A19 용어사전(Jira 102) — 실제 키로 응답 모양을 확인한 뒤 [확정](2026-10-29)
    @Test
    void dictionaryApiIsDocumentedWithQueryAndErrors() throws Exception {
        String operation = op("/api/v1/dictionary");
        docs().andExpect(jsonPath(operation + ".summary", startsWith("[확정] A19 ")))
                .andExpect(jsonPath(operation + ".tags", contains("용어사전")))
                .andExpect(jsonPath(operation + ".parameters[*].name", contains("q")))
                .andExpect(jsonPath(operation + ".parameters[0].description", not(emptyOrNullString())))
                // 없어도 400 · errors[q] 로 답하려고 필수로 두지 않았다
                .andExpect(jsonPath(operation + ".parameters[?(@.required == true)]")
                        .isEmpty())
                .andExpect(jsonPath(
                        operation + ".responses['200'].content['application/json'].schema['$ref']",
                        endsWith("/DictionaryResponse")))
                .andExpect(jsonPath(operation + ".responses['400'].description", containsString("VALIDATION_FAILED")))
                .andExpect(
                        jsonPath(operation + ".responses['502'].description", containsString("DICTIONARY_UNAVAILABLE")))
                .andExpect(jsonPath(
                        operation + ".responses['400'].content['application/problem+json'].schema['$ref']",
                        endsWith("/Problem")))
                .andExpect(jsonPath(
                        operation + ".responses['502'].content['application/problem+json'].schema['$ref']",
                        endsWith("/Problem")))
                .andExpect(jsonPath(problemExample(operation, "502") + ".code").value("DICTIONARY_UNAVAILABLE"))
                .andExpect(jsonPath(
                        "$.components.schemas.DictionaryItem.properties.pos.type", hasItems("string", "null")));
    }

    @Test
    void interestIssueApisExposeConfirmedResponsesAndNullableRemovalTime() throws Exception {
        String path = "/api/v1/members/me/interest-issues/{issueId}";
        var result = docs();
        for (String method : java.util.List.of("put", "delete")) {
            String operation = op(method, path);
            result.andExpect(jsonPath(
                            operation + ".summary", startsWith("[확정] " + (method.equals("put") ? "A23" : "A24"))))
                    .andExpect(jsonPath(operation + ".tags", contains("회원")))
                    .andExpect(jsonPath(operation + ".requestBody").doesNotExist())
                    .andExpect(jsonPath(operation + ".parameters", hasSize(1)))
                    .andExpect(jsonPath(operation + ".parameters[0].name").value("issueId"))
                    .andExpect(
                            jsonPath(operation + ".parameters[0].schema.type").value("integer"))
                    .andExpect(jsonPath(operation + ".responses.*", hasSize(method.equals("put") ? 5 : 4)));
            for (String code : java.util.List.of("200", "400", "401", "403")) {
                result.andExpect(
                        jsonPath(operation + ".responses['" + code + "']").exists());
                if (!code.equals("200"))
                    result.andExpect(jsonPath(
                            operation + ".responses['" + code + "'].content['application/problem+json'].schema['$ref']",
                            endsWith("/Problem")));
            }
            if (method.equals("put"))
                result.andExpect(
                        jsonPath(operation + ".responses['404'].description", containsString("ISSUE_NOT_FOUND")));
        }
        String list = op("/api/v1/members/me/interest-issues");
        result.andExpect(jsonPath(list + ".summary", startsWith("[확정] A25")))
                .andExpect(jsonPath(list + ".tags", contains("회원")))
                .andExpect(jsonPath(list + ".parameters").doesNotExist())
                .andExpect(jsonPath(list + ".responses.*", hasSize(2)))
                .andExpect(jsonPath(list + ".responses['200']").exists())
                .andExpect(jsonPath(list + ".responses['401']").exists())
                .andExpect(jsonPath("$.components.schemas.InterestIssueItem.properties.interestedAt")
                        .exists())
                .andExpect(jsonPath("$.components.schemas.BookmarkItem.properties.bookmarkedAt")
                        .exists())
                .andExpect(jsonPath("$.components.schemas.Item").doesNotExist())
                .andExpect(jsonPath("$.components.schemas.IssueCardResponse.properties.interested.type")
                        .value("boolean"))
                .andExpect(jsonPath("$.components.schemas.IssueHeaderResponse.properties.interested.type")
                        .value("boolean"))
                .andExpect(jsonPath(
                        "$.components.schemas.InterestIssueStateResponse.properties.interestedAt.type",
                        containsInAnyOrder("string", "null")));
    }
}
