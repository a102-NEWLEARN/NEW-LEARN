package kr.io.newlearn;

import static kr.io.newlearn.MemberAuthApiIntegrationTest.*;
import static kr.io.newlearn.common.security.TestCsrf.csrfToken;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

// 조회 문턱 — 「사건마다 공개 기사 N건 이상」인 사건만 보이고, 그런 사건이 하나도 없는 이슈는 없는 것으로 본다 (Jira 206 후속, 문턱 3)
// 기본값 1 의 동작은 HiddenIssueEventApiIntegrationTest(Jira 179)가 지킨다
//
// 섞인 이슈 MIXED 의 사건, 발생 시점 순서
//   BIG(공개 3) → TWO(공개 2 · 문턱 아래) → EDGE(공개 3 + 숨김 1 · 딱 문턱) → FEW(공개 2 + 숨김 5 · 숨김은 세지 않는다)
// 이슈 SUMMED 는 사건 둘이 공개 2건씩이다 — 기사 합은 4건이지만 사건 단위라 문턱을 못 넘어 사라진다
// 이슈 EXACT 는 사건 하나가 공개 3건이라 보인다
@SpringBootTest(properties = "newlearn.query.min-public-articles=3")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@Transactional
class MinPublicArticlesApiIntegrationTest {
    static final int MIXED = 20601;
    static final int SUMMED = 20602;
    static final int EXACT = 20603;
    static final int BIG = 206011;
    static final int TWO = 206012;
    static final int EDGE = 206013;
    static final int FEW = 206014;
    static final int SUMMED_A = 206021;
    static final int SUMMED_B = 206022;
    static final int EXACT_EVENT = 206031;

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    private long nextArticle = 2060000;

    @BeforeEach
    void fixtures() {
        jdbc.sql("insert into press(code,name) values ('thr206a','가신문'),('thr206b','나신문'),('thr206c','다신문')")
                .update();
        issue(MIXED, "문턱검증 섞인 이슈", "2026-10-01T00:00:00Z", "politics");
        issue(SUMMED, "문턱검증 합만 넘는 이슈", "2026-10-05T00:00:00Z", "world");
        issue(EXACT, "문턱검증 딱 세 건 이슈", "2026-10-06T00:00:00Z", "economy");
        event(BIG, MIXED, "문턱검증 큰 사건", "2026-10-10T00:00:00Z");
        event(TWO, MIXED, "문턱검증 두 건 사건", "2026-10-11T00:00:00Z");
        event(EDGE, MIXED, "문턱검증 딱 문턱 사건", "2026-10-12T00:00:00Z");
        event(FEW, MIXED, "문턱검증 숨김이 많은 사건", "2026-10-13T00:00:00Z");
        event(SUMMED_A, SUMMED, "문턱검증 합산 사건 가", "2026-10-20T00:00:00Z");
        event(SUMMED_B, SUMMED, "문턱검증 합산 사건 나", "2026-10-21T00:00:00Z");
        event(EXACT_EVENT, EXACT, "문턱검증 딱 세 건 사건", "2026-10-30T00:00:00Z");
        articles(BIG, "thr206a", "thr206b", "thr206c");
        articles(TWO, "thr206a", "thr206b");
        articles(EDGE, "thr206a", "thr206a", "thr206b");
        hiddenArticles(EDGE, 1);
        articles(FEW, "thr206a", "thr206b");
        hiddenArticles(FEW, 5);
        articles(SUMMED_A, "thr206a", "thr206b");
        articles(SUMMED_B, "thr206a", "thr206b");
        articles(EXACT_EVENT, "thr206a", "thr206b", "thr206c");
    }

    @Test
    void categoryIssueCountLeavesOutIssuesWhoseEventsAllFallBelowTheThreshold() throws Exception {
        mvc.perform(get("/api/v1/categories"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.code=='politics')].issueCount").value(contains(1)))
                .andExpect(jsonPath("$.items[?(@.code=='economy')].issueCount").value(contains(1)))
                .andExpect(jsonPath("$.items[?(@.code=='world')].issueCount").value(contains(0)));
    }

    // 행과 전체 수(같은 목록 질의, 끝을 넘은 쪽만 개수 질의)가 같은 규칙이어야 쪽 계산이 맞는다
    @Test
    void issueListCountsOnlyEventsAtTheThresholdAndTotalMatchesRows() throws Exception {
        mvc.perform(get("/api/v1/issues"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.items[0].id").value(EXACT))
                .andExpect(jsonPath("$.items[0].eventCount").value(1))
                .andExpect(jsonPath("$.items[0].articleCount").value(3))
                .andExpect(jsonPath("$.items[1].id").value(MIXED))
                .andExpect(jsonPath("$.items[1].eventCount").value(2))
                .andExpect(jsonPath("$.items[1].articleCount").value(6))
                .andExpect(jsonPath("$.items[1].publisherCount").value(3))
                .andExpect(jsonPath("$.items[1].firstEventAt").value("2026-10-10T09:00:00+09:00"))
                .andExpect(jsonPath("$.items[1].lastEventAt").value("2026-10-12T09:00:00+09:00"))
                .andExpect(jsonPath("$.items[1].lastEvent.id").value(EDGE));
    }

    @Test
    void issueListFiltersSortAndPagesFollowTheSameRule() throws Exception {
        mvc.perform(get("/api/v1/issues").param("sort", "createdAt"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(EXACT))
                .andExpect(jsonPath("$.items[1].id").value(MIXED))
                .andExpect(jsonPath("$.totalElements").value(2));
        mvc.perform(get("/api/v1/issues").param("category", "politics"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].id").value(MIXED));
        mvc.perform(get("/api/v1/issues").param("category", "world"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.items", hasSize(0)));
        mvc.perform(get("/api/v1/issues").param("size", "1").param("page", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].id").value(MIXED));
    }

    @Test
    void issueHeaderCountsOnlyEventsAtTheThresholdAndIsNotFoundWithoutAny() throws Exception {
        mvc.perform(get("/api/v1/issues/" + MIXED))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.eventCount").value(2))
                .andExpect(jsonPath("$.articleCount").value(6))
                .andExpect(jsonPath("$.publisherCount").value(3))
                .andExpect(jsonPath("$.lastEventAt").value("2026-10-12T09:00:00+09:00"));
        mvc.perform(get("/api/v1/issues/" + EXACT)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/issues/" + SUMMED))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ISSUE_NOT_FOUND"));
    }

    @Test
    void timelineShowsOnlyEventsAtTheThreshold() throws Exception {
        mvc.perform(get("/api/v1/issues/" + MIXED + "/timeline"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.events", hasSize(2)))
                .andExpect(jsonPath("$.events[0].id").value(BIG))
                .andExpect(jsonPath("$.events[0].articleCount").value(3))
                .andExpect(jsonPath("$.events[1].id").value(EDGE))
                .andExpect(jsonPath("$.events[1].articleCount").value(3));
        mvc.perform(get("/api/v1/issues/" + SUMMED + "/timeline"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ISSUE_NOT_FOUND"));
    }

    // 사건 패널 자체는 문턱과 무관하게 열린다(공개 기사가 하나라도 있으면). 앞뒤 사건만 타임라인과 같은 집합에서 고른다
    @Test
    void eventPanelStaysOpenButNeighboursSkipEventsBelowTheThreshold() throws Exception {
        mvc.perform(get("/api/v1/events/" + BIG))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.previousEvent").value(nullValue()))
                .andExpect(jsonPath("$.nextEvent.id").value(EDGE));
        mvc.perform(get("/api/v1/events/" + EDGE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.previousEvent.id").value(BIG))
                .andExpect(jsonPath("$.nextEvent").value(nullValue()));
        mvc.perform(get("/api/v1/events/" + TWO))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.articleCount").value(2))
                .andExpect(jsonPath("$.previousEvent.id").value(BIG))
                .andExpect(jsonPath("$.nextEvent.id").value(EDGE));
    }

    @Test
    void searchLeavesOutIssuesAndEventsBelowTheThreshold() throws Exception {
        mvc.perform(get("/api/v1/search").param("q", "문턱검증"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issues", hasSize(2)))
                .andExpect(jsonPath("$.issues[0].id").value(EXACT))
                .andExpect(jsonPath("$.issues[1].id").value(MIXED))
                .andExpect(jsonPath("$.events", hasSize(3)))
                .andExpect(jsonPath("$.events[0].id").value(EXACT_EVENT))
                .andExpect(jsonPath("$.events[1].id").value(EDGE))
                .andExpect(jsonPath("$.events[2].id").value(BIG));
    }

    @Test
    void savingAnIssueBelowTheThresholdIsNotFoundAndSavedOnesDropOutOfTheList() throws Exception {
        Cookie session = join("threshold206");
        save(session, SUMMED)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ISSUE_NOT_FOUND"));
        save(session, EXACT).andExpect(status().isOk());

        // 이미 저장해 둔 뒤에 문턱을 올린 경우 — 행은 남고 목록에서만 빠진다
        jdbc.sql("""
                insert into interest_issue(member_id,issue_id)
                select id,:issue from member where login_id='threshold206'
                """).param("issue", SUMMED).update();
        mvc.perform(get("/api/v1/members/me/interest-issues").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].id").value(EXACT))
                .andExpect(jsonPath("$.items[0].eventCount").value(1));
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

    private void event(int id, int issueId, String title, String occurredAt) {
        jdbc.sql("""
                insert into event(id,issue_id,title,label,occurred_at,occurred_at_basis,created_at,updated_at,role)
                values (:id,:issue,:title,'키워드',cast(:at as timestamptz),'EXTRACTED',now(),now(),'MAIN')
                """)
                .param("id", id)
                .param("issue", issueId)
                .param("title", title)
                .param("at", occurredAt)
                .update();
    }

    // 공개 기사를 언론사 순서대로 넣는다
    private void articles(int eventId, String... presses) {
        for (String press : presses) {
            article(press, true, eventId);
        }
    }

    private void hiddenArticles(int eventId, int count) {
        for (int i = 0; i < count; i++) {
            article("thr206a", false, eventId);
        }
    }

    private void article(String press, boolean released, int eventId) {
        long id = ++nextArticle;
        jdbc.sql("""
                insert into article(id,source,url,press_code,title,body,published_at,category_code,released_at,created_at)
                values (:id,'NEWSDATA',:url,:press,'기사','본문',now(),'politics',
                case when :released then now() else null end,now())
                """)
                .param("id", id)
                .param("url", "https://fixture.invalid/206/" + id)
                .param("press", press)
                .param("released", released)
                .update();
        jdbc.sql("insert into article_event values (:article,:event,now())")
                .param("article", id)
                .param("event", eventId)
                .update();
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

    private ResultActions save(Cookie session, int issueId) throws Exception {
        return mvc.perform(put("/api/v1/members/me/interest-issues/" + issueId)
                .cookie(session)
                .with(csrfToken()));
    }
}
