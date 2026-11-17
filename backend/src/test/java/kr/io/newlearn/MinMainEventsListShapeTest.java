package kr.io.newlearn;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

// 메인 흐름 문턱의 LIST 모양 (Jira 224, 계획 docs/plans/2026-11-16-main-flow-issues.md)
// 이슈 목록 질의는 기사 문턱이 1 이면 LIST, 2 이상이면 LIST_WITH_THRESHOLD 로 간다(IssueQueryRepository). 사이트 조합(기사 3)은
// MinPublicEventsApiIntegrationTest 가 지키고, 여기는 기사 문턱 1 · 메인 문턱 1 로 LIST 에 붙인 having 을 지킨다 —
// 한 모양만 고치면 전체 수와 행이 어긋나도 다른 시험은 다 초록이다(전체 수는 같은 목록 질의의 count(*) over (), Jira 227).
//
//   MAIN_ONE 메인 1 · 서브 1 → 보인다 / SUB_ONLY 서브 2 → 목록 · 전체 수 · 분야별 개수 · 검색 이슈 칸에서 빠진다
@SpringBootTest(properties = "newlearn.query.min-main-events=1")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@Transactional
class MinMainEventsListShapeTest {
    static final int MAIN_ONE = 22401;
    static final int SUB_ONLY = 22402;

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    private long nextArticle = 2240000;

    @BeforeEach
    void fixtures() {
        jdbc.sql("insert into press(code,name) values ('main224','가신문')").update();
        issue(MAIN_ONE, "목록모양검증 메인 있는 이슈", "2026-10-01T00:00:00Z");
        issue(SUB_ONLY, "목록모양검증 서브만 이슈", "2026-10-02T00:00:00Z");
        event(224011, MAIN_ONE, "MAIN", "2026-10-05T00:00:00Z");
        event(224012, MAIN_ONE, "REACTION", "2026-10-06T00:00:00Z");
        event(224021, SUB_ONLY, "REACTION", "2026-10-07T00:00:00Z");
        event(224022, SUB_ONLY, "REACTION", "2026-10-08T00:00:00Z");
    }

    // 행과 전체 수가 같은 규칙이어야 쪽 계산이 맞는다 — 서브만 이슈가 더 최근이라 행에 섞이면 맨 앞에 온다
    @Test
    void listRowsAndTotalBothLeaveOutTheIssueWithoutAMainEvent() throws Exception {
        mvc.perform(get("/api/v1/issues"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].id").value(MAIN_ONE))
                .andExpect(jsonPath("$.items[0].eventCount").value(2));
        mvc.perform(get("/api/v1/issues").param("sort", "createdAt").param("category", "society"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].id").value(MAIN_ONE));
    }

    @Test
    void categoryCountsAndSearchFollowTheSameRule() throws Exception {
        mvc.perform(get("/api/v1/categories"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.code=='society')].issueCount").value(contains(1)));
        mvc.perform(get("/api/v1/search").param("q", "목록모양검증"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issues", hasSize(1)))
                .andExpect(jsonPath("$.issues[0].id").value(MAIN_ONE));
    }

    private void issue(int id, String title, String createdAt) {
        jdbc.sql("""
                insert into issue(id,title,summary,created_at,updated_at)
                values (:id,:title,'요약',cast(:at as timestamptz),cast(:at as timestamptz))
                """)
                .param("id", id)
                .param("title", title)
                .param("at", createdAt)
                .update();
        jdbc.sql("insert into issue_category values (:id,'society')")
                .param("id", id)
                .update();
    }

    // 공개 기사 1건 — 기사 문턱 1 이면 보이는 사건이다
    private void event(int id, int issueId, String role, String occurredAt) {
        jdbc.sql("""
                insert into event(id,issue_id,title,label,occurred_at,occurred_at_basis,created_at,updated_at,role)
                values (:id,:issue,:title,'키워드',cast(:at as timestamptz),'EXTRACTED',now(),now(),:role)
                """)
                .param("id", id)
                .param("issue", issueId)
                .param("title", "목록모양검증 사건 " + id)
                .param("at", occurredAt)
                .param("role", role)
                .update();
        long article = ++nextArticle;
        jdbc.sql("""
                insert into article(id,source,url,press_code,title,body,published_at,category_code,released_at,created_at)
                values (:id,'NEWSDATA',:url,'main224','기사','본문',now(),'society',now(),now())
                """)
                .param("id", article)
                .param("url", "https://fixture.invalid/224/" + article)
                .update();
        jdbc.sql("insert into article_event values (:article,:event,now())")
                .param("article", article)
                .param("event", id)
                .update();
    }
}
