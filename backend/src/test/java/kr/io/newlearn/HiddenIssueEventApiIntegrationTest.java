package kr.io.newlearn;

import static kr.io.newlearn.MemberAuthApiIntegrationTest.*;
import static kr.io.newlearn.common.security.TestCsrf.csrfToken;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.NestedTestConfiguration;
import org.springframework.test.context.NestedTestConfiguration.EnclosingConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

// 기사가 모두 숨겨진 이슈 · 사건은 조회에서 없는 것으로 본다 (docs/api.md 1절, Jira 179)
//
// 섞인 이슈 MIXED 의 사건, 발생 시점 순서
//   PUBLIC(공개 2건) → HIDDEN_MIDDLE(모두 숨김) → PARTLY(공개 1 · 숨김 1, HIDDEN_MIDDLE 에 반응) → HIDDEN_LAST(모두 숨김)
// 이슈 ALL_HIDDEN 은 사건 하나의 기사가 모두 숨겨졌고, 가장 최근에 만들어져 빠지지 않으면 맨 앞에 온다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@Transactional
class HiddenIssueEventApiIntegrationTest {
    static final int MIXED = 17901;
    static final int ALL_HIDDEN = 17902;
    static final int PUBLIC = 179011;
    static final int HIDDEN_MIDDLE = 179012;
    static final int PARTLY = 179013;
    static final int HIDDEN_LAST = 179014;
    static final int IN_ALL_HIDDEN = 179021;
    static final int LOOSE_HIDDEN = 179031;
    static final int LOOSE_PUBLIC = 179032;
    static final long ARTICLE_OF_ALL_HIDDEN = 179107;

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @BeforeEach
    void fixtures() {
        jdbc.sql("insert into press(code,name) values ('hide179a','가신문'),('hide179b','나신문')")
                .update();
        issue(MIXED, "숨김검증 섞인 이슈", "2026-10-01T00:00:00Z", "politics");
        issue(ALL_HIDDEN, "숨김검증 모두 숨긴 이슈", "2026-10-05T00:00:00Z", "world");
        event(PUBLIC, MIXED, "숨김검증 공개 사건", "2026-10-10T00:00:00Z");
        event(HIDDEN_MIDDLE, MIXED, "숨김검증 가운데 숨긴 사건", "2026-10-11T00:00:00Z");
        event(PARTLY, MIXED, "숨김검증 일부 숨긴 사건", "2026-10-12T00:00:00Z");
        event(HIDDEN_LAST, MIXED, "숨김검증 마지막 숨긴 사건", "2026-10-13T00:00:00Z");
        event(IN_ALL_HIDDEN, ALL_HIDDEN, "숨김검증 숨긴 이슈의 사건", "2026-10-20T00:00:00Z");
        event(LOOSE_HIDDEN, null, "숨김검증 이슈 밖 숨긴 사건", "2026-10-21T00:00:00Z");
        event(LOOSE_PUBLIC, null, "숨김검증 이슈 밖 공개 사건", "2026-10-22T00:00:00Z");
        jdbc.sql("update event set role='REACTION', reacts_to_event_id=:target where id=:id")
                .param("target", HIDDEN_MIDDLE)
                .param("id", PARTLY)
                .update();
        article(179101, "hide179a", true, PUBLIC);
        article(179102, "hide179b", true, PUBLIC);
        article(179103, "hide179a", false, HIDDEN_MIDDLE);
        article(179104, "hide179a", true, PARTLY);
        article(179105, "hide179b", false, PARTLY);
        article(179106, "hide179a", false, HIDDEN_LAST);
        article(ARTICLE_OF_ALL_HIDDEN, "hide179a", false, IN_ALL_HIDDEN);
        article(179108, "hide179a", false, LOOSE_HIDDEN);
        article(179109, "hide179a", true, LOOSE_PUBLIC);
    }

    @Test
    void categoryIssueCountLeavesOutIssuesWithoutPublicArticles() throws Exception {
        mvc.perform(get("/api/v1/categories"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].code").value("politics"))
                .andExpect(jsonPath("$.items[0].issueCount").value(1))
                .andExpect(jsonPath("$.items[3].code").value("world"))
                .andExpect(jsonPath("$.items[3].issueCount").value(0));
    }

    @Test
    void issueListCountsOnlyPublicEventsAndPagesOnlyPublicIssues() throws Exception {
        mvc.perform(get("/api/v1/issues"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.totalPages").value(1))
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].id").value(MIXED))
                .andExpect(jsonPath("$.items[0].eventCount").value(2))
                .andExpect(jsonPath("$.items[0].articleCount").value(3))
                .andExpect(jsonPath("$.items[0].publisherCount").value(2))
                .andExpect(jsonPath("$.items[0].firstEventAt").value("2026-10-10T09:00:00+09:00"))
                .andExpect(jsonPath("$.items[0].lastEventAt").value("2026-10-12T09:00:00+09:00"))
                .andExpect(jsonPath("$.items[0].lastEvent.id").value(PARTLY));
    }

    @Test
    void issueListFiltersAndNewestSortLeaveOutHiddenIssues() throws Exception {
        mvc.perform(get("/api/v1/issues").param("sort", "createdAt"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(MIXED))
                .andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/v1/issues").param("category", "politics"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/v1/issues").param("category", "world"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.items", hasSize(0)));
    }

    @Test
    void issueHeaderIsNotFoundWithoutPublicArticles() throws Exception {
        mvc.perform(get("/api/v1/issues/" + MIXED))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.eventCount").value(2))
                .andExpect(jsonPath("$.lastEventAt").value("2026-10-12T09:00:00+09:00"));
        mvc.perform(get("/api/v1/issues/" + ALL_HIDDEN))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ISSUE_NOT_FOUND"));
    }

    @Test
    void timelineShowsOnlyPublicEventsAndDropsReactionsToHiddenOnes() throws Exception {
        mvc.perform(get("/api/v1/issues/" + MIXED + "/timeline"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.events", hasSize(2)))
                .andExpect(jsonPath("$.events[0].id").value(PUBLIC))
                .andExpect(jsonPath("$.events[1].id").value(PARTLY))
                .andExpect(jsonPath("$.events[1].articleCount").value(1))
                .andExpect(jsonPath("$.events[1].reactsToEventId").value(nullValue()));
        mvc.perform(get("/api/v1/issues/" + ALL_HIDDEN + "/timeline"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ISSUE_NOT_FOUND"));
    }

    @Test
    void eventPanelIsNotFoundWithoutPublicArticlesAndNeighboursSkipThem() throws Exception {
        mvc.perform(get("/api/v1/events/" + PUBLIC))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.previousEvent").value(nullValue()))
                .andExpect(jsonPath("$.nextEvent.id").value(PARTLY));
        mvc.perform(get("/api/v1/events/" + PARTLY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.articleCount").value(1))
                .andExpect(jsonPath("$.previousEvent.id").value(PUBLIC))
                .andExpect(jsonPath("$.nextEvent").value(nullValue()));
        mvc.perform(get("/api/v1/events/" + LOOSE_PUBLIC))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issue").value(nullValue()));
        for (int hidden : new int[] {HIDDEN_MIDDLE, IN_ALL_HIDDEN, LOOSE_HIDDEN}) {
            mvc.perform(get("/api/v1/events/" + hidden))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("EVENT_NOT_FOUND"));
        }
    }

    @Test
    void eventArticlesAreNotFoundWithoutPublicArticlesButPastTheLastPageStaysEmpty() throws Exception {
        mvc.perform(get("/api/v1/events/" + PARTLY + "/articles"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/v1/events/" + PARTLY + "/articles").param("page", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)))
                .andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/v1/events/" + HIDDEN_MIDDLE + "/articles"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EVENT_NOT_FOUND"));
    }

    @Test
    void searchLeavesOutIssuesAndEventsWithoutPublicArticles() throws Exception {
        mvc.perform(get("/api/v1/search").param("q", "숨김검증"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issues", hasSize(1)))
                .andExpect(jsonPath("$.issues[0].id").value(MIXED))
                .andExpect(jsonPath("$.events", hasSize(2)))
                .andExpect(jsonPath("$.events[0].id").value(PARTLY))
                .andExpect(jsonPath("$.events[1].id").value(PUBLIC));
    }

    @Test
    void savingAHiddenIssueIsNotFoundButRemovingItStillWorks() throws Exception {
        Cookie session = join("hidden179_save");
        save(session, ALL_HIDDEN)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ISSUE_NOT_FOUND"));
        save(session, MIXED).andExpect(status().isOk());

        keepInterest("hidden179_save", ALL_HIDDEN);
        save(session, ALL_HIDDEN).andExpect(status().isNotFound());
        assertThat(interestRows("hidden179_save")).isEqualTo(2);
        interests(session)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].id").value(MIXED));

        mvc.perform(delete("/api/v1/members/me/interest-issues/" + ALL_HIDDEN)
                        .cookie(session)
                        .with(csrfToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.interested").value(false));
        assertThat(interestRows("hidden179_save")).isEqualTo(1);
    }

    // 지우지 않으므로 기사를 다시 공개하면 이슈 · 사건 · 관심 이슈가 그대로 돌아온다
    @Test
    void releasingTheArticleBringsEverythingBack() throws Exception {
        Cookie session = join("hidden179_back");
        keepInterest("hidden179_back", ALL_HIDDEN);

        jdbc.sql("update article set released_at=now() where id=:id")
                .param("id", ARTICLE_OF_ALL_HIDDEN)
                .update();

        mvc.perform(get("/api/v1/issues"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.items[0].id").value(ALL_HIDDEN));
        mvc.perform(get("/api/v1/issues/" + ALL_HIDDEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.articleCount").value(1));
        mvc.perform(get("/api/v1/events/" + IN_ALL_HIDDEN)).andExpect(status().isOk());
        interests(session)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].id").value(ALL_HIDDEN));
    }

    // 공개 기사가 모자란 사건은 화면에서 없는 것으로 본다 (Jira S15P31A102-206 후속).
    // 2026-11-14 측정: 사건마다 공개 기사 3건 이상만 보이면 이슈 쌍 정밀도가 0.930 → 0.976 으로 오른다.
    // 기준은 사건 단위다 — 「공개 기사 3건 이상인 사건」만 보이고, 그런 사건이 하나도 없는 이슈가 사라진다
    @Nested
    @NestedTestConfiguration(EnclosingConfiguration.OVERRIDE)
    @SpringBootTest
    @AutoConfigureMockMvc
    @Import(TestcontainersConfiguration.class)
    @Transactional
    @TestPropertySource(properties = "newlearn.query.min-public-articles=3")
    class MinPublicArticles {
        static final int RICH = 17905;
        static final int THIN_ONLY = 17906;
        static final int THICK_EVENT = 179051;
        static final int THIN_EVENT = 179052;
        static final int ONE_ARTICLE_EVENT = 179061;

        @BeforeEach
        void more() {
            issue(RICH, "문턱검증 기사 많은 이슈", "2026-10-06T00:00:00Z", "economy");
            issue(THIN_ONLY, "문턱검증 기사 적은 이슈", "2026-10-07T00:00:00Z", "world");
            event(THICK_EVENT, RICH, "문턱검증 공개 3건 사건", "2026-10-14T00:00:00Z");
            event(THIN_EVENT, RICH, "문턱검증 공개 2건 사건", "2026-10-15T00:00:00Z");
            event(ONE_ARTICLE_EVENT, THIN_ONLY, "문턱검증 공개 1건 사건", "2026-10-16T00:00:00Z");
            article(179201, "hide179a", true, THICK_EVENT);
            article(179202, "hide179b", true, THICK_EVENT);
            article(179203, "hide179a", true, THICK_EVENT);
            article(179204, "hide179a", true, THIN_EVENT);
            article(179205, "hide179b", true, THIN_EVENT);
            article(179206, "hide179a", true, ONE_ARTICLE_EVENT);
        }

        @Test
        void timelineKeepsOnlyEventsWithEnoughArticles() throws Exception {
            mvc.perform(get("/api/v1/issues/" + RICH + "/timeline"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.events", hasSize(1)))
                    .andExpect(jsonPath("$.events[0].id").value(THICK_EVENT))
                    .andExpect(jsonPath("$.events[0].articleCount").value(3));
        }

        // 보일 사건이 하나도 없으면 이슈가 사라진다 — 기사가 모두 숨겨졌을 때와 같은 규칙(Jira 179)
        @Test
        void anIssueWithoutEnoughArticlesIsGoneEverywhere() throws Exception {
            mvc.perform(get("/api/v1/issues/" + THIN_ONLY)).andExpect(status().isNotFound());
            mvc.perform(get("/api/v1/issues/" + THIN_ONLY + "/timeline")).andExpect(status().isNotFound());
            mvc.perform(get("/api/v1/issues/" + MIXED)).andExpect(status().isNotFound());
        }

        // 목록의 총수와 실제 행이 같아야 한다 — 수를 세는 질의와 행을 가져오는 질의가 따로다
        @Test
        void issueListCountsAndRowsAgree() throws Exception {
            mvc.perform(get("/api/v1/issues"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totalElements").value(1))
                    .andExpect(jsonPath("$.items", hasSize(1)))
                    .andExpect(jsonPath("$.items[0].id").value(RICH))
                    .andExpect(jsonPath("$.items[0].eventCount").value(1))
                    .andExpect(jsonPath("$.items[0].articleCount").value(3))
                    .andExpect(jsonPath("$.items[0].publisherCount").value(2))
                    .andExpect(jsonPath("$.items[0].lastEvent.id").value(THICK_EVENT));
        }

        @Test
        void categoryCountsFollowTheThreshold() throws Exception {
            mvc.perform(get("/api/v1/categories"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[?(@.code=='economy')].issueCount")
                            .value(org.hamcrest.Matchers.contains(1)))
                    .andExpect(jsonPath("$.items[?(@.code=='politics')].issueCount")
                            .value(org.hamcrest.Matchers.contains(0)))
                    .andExpect(jsonPath("$.items[?(@.code=='world')].issueCount")
                            .value(org.hamcrest.Matchers.contains(0)));
        }

        @Test
        void searchLeavesOutWhatTheThresholdHides() throws Exception {
            mvc.perform(get("/api/v1/search").param("q", "문턱검증"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.issues", hasSize(1)))
                    .andExpect(jsonPath("$.issues[0].id").value(RICH))
                    .andExpect(jsonPath("$.events", hasSize(1)))
                    .andExpect(jsonPath("$.events[0].id").value(THICK_EVENT));
        }

        @Test
        void savingAnIssueBelowTheThresholdIsNotFound() throws Exception {
            Cookie session = join("threshold206_save");

            save(session, THIN_ONLY).andExpect(status().isNotFound());
            save(session, RICH).andExpect(status().isOk());
            interests(session)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items", hasSize(1)))
                    .andExpect(jsonPath("$.items[0].id").value(RICH))
                    .andExpect(jsonPath("$.items[0].eventCount").value(1));
        }
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

    private void event(int id, Integer issueId, String title, String occurredAt) {
        jdbc.sql("""
                insert into event(id,issue_id,title,label,occurred_at,occurred_at_basis,created_at,updated_at,role)
                values (:id,:issue,:title,'키워드',cast(:at as timestamptz),'EXTRACTED',now(),now(),'MAIN')
                """)
                .param("id", id)
                .param("issue", issueId, java.sql.Types.BIGINT)
                .param("title", title)
                .param("at", occurredAt)
                .update();
    }

    private void article(long id, String press, boolean released, int eventId) {
        jdbc.sql("""
                insert into article(id,source,url,press_code,title,body,published_at,category_code,released_at,created_at)
                values (:id,'NEWSDATA',:url,:press,'기사','본문',now(),'politics',
                case when :released then now() else null end,now())
                """)
                .param("id", id)
                .param("url", "https://fixture.invalid/179/" + id)
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

    private ResultActions interests(Cookie session) throws Exception {
        return mvc.perform(get("/api/v1/members/me/interest-issues").cookie(session));
    }

    // 이미 저장해 둔 뒤에 기사가 숨겨진 경우 — API 로는 만들 수 없어 행을 직접 넣는다
    private void keepInterest(String loginId, int issueId) {
        jdbc.sql("""
                insert into interest_issue(member_id,issue_id)
                select id,:issue from member where login_id=:login
                """).param("issue", issueId).param("login", loginId).update();
    }

    private long interestRows(String loginId) {
        return jdbc.sql("""
                select count(*) from interest_issue
                where member_id=(select id from member where login_id=:login)
                """).param("login", loginId).query(Long.class).single();
    }
}
