package kr.io.newlearn;

import static kr.io.newlearn.MemberAuthApiIntegrationTest.*;
import static kr.io.newlearn.common.security.TestCsrf.csrfToken;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

// 사건 수 문턱 — 보이는 사건이 N개 미만인 이슈는 「둘러보다 마주치는 길」에서만 뺀다 (Jira S15P31A102-208)
//   빼는 곳: A2 이슈 목록(행 · 전체 수) · A1 분야별 개수 · A13 검색의 이슈 칸
//   그대로: A3 · A4 이슈 페이지, A5 · A8 의 이슈 링크, A13 검색의 사건 칸, A23 저장 · A25 목록
//
// 🔴 두 문턱을 **함께** 켠다 — 운영과 같은 조합이다. 사건 문턱만 켜면 IssueQueryRepository 가 기사 문턱만 보고 고르는
// LIST_WITH_THRESHOLD 경로가 한 번도 돌지 않아, 거기 붙인 having 과 바인딩이 시험을 다 통과하고도 운영 첫 요청에서 터진다.
// 사건 문턱을 끈 상태(기본 1)는 MinPublicArticlesApiIntegrationTest 가 같은 기사 문턱 3 으로 지킨다.
//
// 이슈마다 「사건 수 / 그중 보이는 사건 수」
//   THREE 3/3 · EDGE 4/3(딱 문턱) → 보인다
//   TWO_EVENTS 2/2 · ONE_EVENT 1/1 · MIXED 4/2(사건은 넷이지만 둘은 기사가 2건뿐) → 목록에서 빠진다
//
// 메인 흐름 문턱(Jira 224)도 운영과 같이 1 로 켠다 — 보이는 사건 중 메인(MAIN)이 하나도 없는 이슈는 같은 자리에서 빠진다.
// 위 이슈들의 사건은 모두 MAIN 이라 결과가 그대로다. 메인 흐름 픽스처(society 분야, 「메인흐름검증」)
//   MAIN_ONE 메인 1 · 서브 2 → 보인다 / SUB_ONLY 서브 3 → 빠진다 / THIN_MAIN 메인은 기사 2건뿐(안 보임) · 서브 3 → 빠진다
// 이 클래스가 사이트 경로(LIST_WITH_THRESHOLD)를 지킨다. 기사 문턱 1 의 LIST 모양은 MinMainEventsListShapeTest
@SpringBootTest(
        properties = {
            "newlearn.query.min-public-articles=3",
            "newlearn.query.min-public-events=3",
            "newlearn.query.min-main-events=1"
        })
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@Transactional
class MinPublicEventsApiIntegrationTest {
    static final int THREE = 20801;
    static final int TWO_EVENTS = 20802;
    static final int ONE_EVENT = 20803;
    static final int MIXED = 20804;
    static final int EDGE = 20805;
    static final int MAIN_ONE = 20806;
    static final int SUB_ONLY = 20807;
    static final int THIN_MAIN = 20808;
    static final int SUB_ONLY_FIRST = 208071;

    static final int TWO_EVENTS_FIRST = 208021;

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    private long nextArticle = 2080000;
    private long twoEventsArticle;

    @BeforeEach
    void fixtures() {
        jdbc.sql("insert into press(code,name) values ('thr208a','가신문'),('thr208b','나신문'),('thr208c','다신문')")
                .update();
        issue(THREE, "사건수검증 사건 셋 이슈", "2026-10-01T00:00:00Z", "politics");
        issue(TWO_EVENTS, "사건수검증 사건 둘 이슈", "2026-10-02T00:00:00Z", "world");
        issue(ONE_EVENT, "사건수검증 사건 하나 이슈", "2026-10-03T00:00:00Z", "world");
        issue(MIXED, "사건수검증 기사가 모자란 사건이 섞인 이슈", "2026-10-04T00:00:00Z", "economy");
        issue(EDGE, "사건수검증 딱 셋 이슈", "2026-10-05T00:00:00Z", "politics");

        visibleEvent(208011, THREE, "사건수검증 셋 가", "2026-10-10T00:00:00Z");
        visibleEvent(208012, THREE, "사건수검증 셋 나", "2026-10-11T00:00:00Z");
        visibleEvent(208013, THREE, "사건수검증 셋 다", "2026-10-12T00:00:00Z");

        twoEventsArticle = visibleEvent(TWO_EVENTS_FIRST, TWO_EVENTS, "사건수검증 둘 가", "2026-10-14T00:00:00Z");
        visibleEvent(208022, TWO_EVENTS, "사건수검증 둘 나", "2026-10-15T00:00:00Z");

        visibleEvent(208031, ONE_EVENT, "사건수검증 하나", "2026-10-16T00:00:00Z");

        visibleEvent(208041, MIXED, "사건수검증 섞인 가", "2026-10-17T00:00:00Z");
        visibleEvent(208042, MIXED, "사건수검증 섞인 나", "2026-10-18T00:00:00Z");
        thinEvent(208043, MIXED, "사건수검증 섞인 다", "2026-10-19T00:00:00Z");
        thinEvent(208044, MIXED, "사건수검증 섞인 라", "2026-10-19T12:00:00Z");

        visibleEvent(208051, EDGE, "사건수검증 딱 가", "2026-10-20T00:00:00Z");
        visibleEvent(208052, EDGE, "사건수검증 딱 나", "2026-10-21T00:00:00Z");
        visibleEvent(208053, EDGE, "사건수검증 딱 다", "2026-10-22T00:00:00Z");
        thinEvent(208054, EDGE, "사건수검증 딱 라", "2026-10-23T00:00:00Z");

        // 메인 흐름 — 다른 이슈보다 먼저 만들고 사건도 앞서 일어나 두 정렬 모두 맨 뒤에 온다
        issue(MAIN_ONE, "메인흐름검증 메인 하나 이슈", "2026-09-28T00:00:00Z", "society");
        issue(SUB_ONLY, "메인흐름검증 서브만 이슈", "2026-09-29T00:00:00Z", "society");
        issue(THIN_MAIN, "메인흐름검증 메인이 안 보이는 이슈", "2026-09-30T00:00:00Z", "society");

        visibleEvent(208061, MAIN_ONE, "메인흐름검증 하나 가", "2026-10-01T00:00:00Z");
        visibleEvent(208062, MAIN_ONE, "메인흐름검증 하나 나", "2026-10-02T00:00:00Z", "REACTION");
        visibleEvent(208063, MAIN_ONE, "메인흐름검증 하나 다", "2026-10-03T00:00:00Z", "REACTION");

        visibleEvent(SUB_ONLY_FIRST, SUB_ONLY, "메인흐름검증 서브 가", "2026-10-01T00:00:00Z", "REACTION");
        visibleEvent(208072, SUB_ONLY, "메인흐름검증 서브 나", "2026-10-02T00:00:00Z", "REACTION");
        visibleEvent(208073, SUB_ONLY, "메인흐름검증 서브 다", "2026-10-03T00:00:00Z", "REACTION");

        thinEvent(208081, THIN_MAIN, "메인흐름검증 안 보이는 메인", "2026-10-01T00:00:00Z");
        visibleEvent(208082, THIN_MAIN, "메인흐름검증 안보임 나", "2026-10-02T00:00:00Z", "REACTION");
        visibleEvent(208083, THIN_MAIN, "메인흐름검증 안보임 다", "2026-10-03T00:00:00Z", "REACTION");
        visibleEvent(208084, THIN_MAIN, "메인흐름검증 안보임 라", "2026-10-04T00:00:00Z", "REACTION");
    }

    // 행과 전체 수(같은 목록 질의, 끝을 넘은 쪽만 개수 질의)가 같은 규칙이어야 쪽 계산이 맞는다
    @Test
    void issueListAndTotalLeaveOutIssuesWithFewerVisibleEvents() throws Exception {
        mvc.perform(get("/api/v1/issues"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.items", hasSize(3)))
                .andExpect(jsonPath("$.items[0].id").value(EDGE))
                .andExpect(jsonPath("$.items[0].eventCount").value(3))
                .andExpect(jsonPath("$.items[1].id").value(THREE))
                .andExpect(jsonPath("$.items[1].eventCount").value(3))
                .andExpect(jsonPath("$.items[2].id").value(MAIN_ONE))
                .andExpect(jsonPath("$.items[2].eventCount").value(3));
    }

    // 분야 · 정렬 · 쪽 넘기기가 모두 같은 규칙을 따라야 한다 — 한 곳만 거르면 쪽이 비거나 총수가 어긋난다
    @Test
    void filtersSortAndPagesFollowTheSameRule() throws Exception {
        mvc.perform(get("/api/v1/issues").param("sort", "createdAt"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.items[0].id").value(EDGE))
                .andExpect(jsonPath("$.items[1].id").value(THREE))
                .andExpect(jsonPath("$.items[2].id").value(MAIN_ONE));
        mvc.perform(get("/api/v1/issues").param("category", "world"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.items", hasSize(0)));
        mvc.perform(get("/api/v1/issues").param("category", "economy"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
        mvc.perform(get("/api/v1/issues").param("size", "1").param("page", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.totalPages").value(3))
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].id").value(THREE));
        // 끝을 넘은 쪽 — 행이 없어 전체 수만 따로 센다. 그 수도 같은 규칙이어야 한다(Jira 227)
        mvc.perform(get("/api/v1/issues").param("size", "1").param("page", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.items", hasSize(0)));
    }

    // A1 합과 A2 전체 수가 어긋나면 화면의 분야 칸과 목록이 서로 다른 말을 한다
    @Test
    void categoryCountsLeaveOutTheSameIssuesAsTheList() throws Exception {
        mvc.perform(get("/api/v1/categories"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.code=='politics')].issueCount").value(contains(2)))
                .andExpect(jsonPath("$.items[?(@.code=='world')].issueCount").value(contains(0)))
                .andExpect(jsonPath("$.items[?(@.code=='economy')].issueCount").value(contains(0)))
                .andExpect(jsonPath("$.items[?(@.code=='society')].issueCount").value(contains(1)));
    }

    // ── 메인 흐름 (Jira 224) ──

    // 보이는 메인 사건이 하나도 없으면 목록 · 전체 수에서 빠진다. 메인이 있어도 기사가 모자라 안 보이면 없는 것과 같다
    @Test
    void issuesWithoutAVisibleMainEventAreLeftOutOfTheList() throws Exception {
        mvc.perform(get("/api/v1/issues").param("category", "society"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].id").value(MAIN_ONE));
    }

    // 검색의 이슈 칸도 같은 기준이다. 사건 칸은 그대로라 서브 사건에서 그 이슈 페이지로 넘어갈 수 있다
    @Test
    void searchLeavesOutIssuesWithoutAMainEventButKeepsTheirEvents() throws Exception {
        mvc.perform(get("/api/v1/search").param("q", "메인흐름검증"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issues", hasSize(1)))
                .andExpect(jsonPath("$.issues[0].id").value(MAIN_ONE))
                .andExpect(jsonPath("$.events[?(@.id==" + SUB_ONLY_FIRST + ")]", hasSize(1)));
    }

    // 목록에서만 뺀다 — 이슈 페이지와 타임라인은 그대로 열린다(서브 흐름 사건만 보인다)
    @Test
    void issuePageStaysOpenForIssuesWithoutAMainEvent() throws Exception {
        mvc.perform(get("/api/v1/issues/" + SUB_ONLY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.eventCount").value(3));
        mvc.perform(get("/api/v1/issues/" + SUB_ONLY + "/timeline"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.events", hasSize(3)));
        mvc.perform(get("/api/v1/issues/" + THIN_MAIN + "/timeline"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.events", hasSize(3)));
    }

    // 이슈 칸에서는 빠지지만 사건 칸은 그대로다 — 사건을 누르면 살아 있는 이슈 페이지로 간다
    @Test
    void searchLeavesOutTheIssuesButKeepsTheirEvents() throws Exception {
        mvc.perform(get("/api/v1/search").param("q", "사건수검증"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issues", hasSize(2)))
                .andExpect(jsonPath("$.issues[0].id").value(EDGE))
                .andExpect(jsonPath("$.issues[1].id").value(THREE))
                .andExpect(jsonPath("$.events[?(@.id==" + TWO_EVENTS_FIRST + ")]", hasSize(1)))
                .andExpect(jsonPath("$.events[?(@.id==208031)]", hasSize(1)));
    }

    // 목록에서만 뺀다 — 주소를 알고 들어오면 그대로 열린다(계획 「안 바꿀 것」)
    @Test
    void issuePageStaysOpenForIssuesLeftOutOfTheList() throws Exception {
        mvc.perform(get("/api/v1/issues/" + TWO_EVENTS))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.eventCount").value(2));
        mvc.perform(get("/api/v1/issues/" + TWO_EVENTS + "/timeline"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.events", hasSize(2)));
        mvc.perform(get("/api/v1/issues/" + ONE_EVENT))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.eventCount").value(1));
        mvc.perform(get("/api/v1/issues/" + ONE_EVENT + "/timeline"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.events", hasSize(1)));
    }

    // 이슈 링크를 null 로 보내면 기사 화면이 「아직 이슈로 묶이지 않았어요」라는 틀린 문구를 띄운다 — 그대로 싣는다
    @Test
    void eventPanelAndArticleDetailKeepTheIssueLink() throws Exception {
        mvc.perform(get("/api/v1/events/" + TWO_EVENTS_FIRST))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issue.id").value(TWO_EVENTS));
        mvc.perform(get("/api/v1/articles/" + twoEventsArticle))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issue.id").value(TWO_EVENTS));
    }

    // 내가 저장한 것은 내 것이다 — 저장도 되고 마이페이지에도 남는다
    @Test
    void savingAnIssueLeftOutOfTheListStillWorksAndStaysInMyList() throws Exception {
        Cookie session = join("eventthr208");
        mvc.perform(put("/api/v1/members/me/interest-issues/" + TWO_EVENTS)
                        .cookie(session)
                        .with(csrfToken()))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/members/me/interest-issues").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].id").value(TWO_EVENTS))
                .andExpect(jsonPath("$.items[0].eventCount").value(2));
    }

    private void issue(int id, String title, String createdAt, String category) {
        jdbc.sql("""
                insert into issue(id,title,summary,created_at,updated_at)
                values (:id,:title,'요약',cast(:at as timestamptz),cast(:at as timestamptz))
                """)
                .param("id", id)
                .param("title", title)
                .param("at", createdAt)
                .update();
        jdbc.sql("insert into issue_category values (:id,:category)")
                .param("id", id)
                .param("category", category)
                .update();
    }

    // 공개 기사 3건 — 기사 문턱을 넘어 화면에 보이는 사건이다. 첫 기사 번호를 돌려준다(A8 확인용)
    private long visibleEvent(int id, int issueId, String title, String occurredAt) {
        return visibleEvent(id, issueId, title, occurredAt, "MAIN");
    }

    // 역할을 고르는 판 — 서브 흐름(REACTION) 사건을 만들 때 쓴다(Jira 224)
    private long visibleEvent(int id, int issueId, String title, String occurredAt, String role) {
        event(id, issueId, title, occurredAt, role);
        long first = article("thr208a", id);
        article("thr208b", id);
        article("thr208c", id);
        return first;
    }

    // 공개 기사 2건 — 기사 문턱 아래라 보이는 사건으로 세지 않는다
    private void thinEvent(int id, int issueId, String title, String occurredAt) {
        event(id, issueId, title, occurredAt);
        article("thr208a", id);
        article("thr208b", id);
    }

    private void event(int id, int issueId, String title, String occurredAt) {
        event(id, issueId, title, occurredAt, "MAIN");
    }

    private void event(int id, int issueId, String title, String occurredAt, String role) {
        jdbc.sql("""
                insert into event(id,issue_id,title,label,occurred_at,occurred_at_basis,created_at,updated_at,role)
                values (:id,:issue,:title,'키워드',cast(:at as timestamptz),'EXTRACTED',now(),now(),:role)
                """)
                .param("id", id)
                .param("issue", issueId)
                .param("title", title)
                .param("at", occurredAt)
                .param("role", role)
                .update();
    }

    private long article(String press, int eventId) {
        long id = ++nextArticle;
        jdbc.sql("""
                insert into article(id,source,url,press_code,title,body,published_at,category_code,released_at,created_at)
                values (:id,'NEWSDATA',:url,:press,'기사','본문',now(),'politics',now(),now())
                """)
                .param("id", id)
                .param("url", "https://fixture.invalid/208/" + id)
                .param("press", press)
                .update();
        jdbc.sql("insert into article_event values (:article,:event,now())")
                .param("article", id)
                .param("event", eventId)
                .update();
        return id;
    }

    private Cookie join(String loginId) throws Exception {
        return sessionCookie(mvc.perform(post("/api/v1/members")
                        .with(csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signUpBody(loginId, "password1", "독자", "economy")))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse());
    }
}
