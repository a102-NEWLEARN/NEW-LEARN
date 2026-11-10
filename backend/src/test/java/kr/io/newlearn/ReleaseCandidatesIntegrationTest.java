package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// B3 자동 투입 판단 자료 (Jira 156, docs/api-internal.md 2절). 실제 PostgreSQL 로 본다
// 세는 법은 AI 팀장 쿼리(infra/server/b1-state.sql)와 같다 — 그 쿼리가 본 경계를 여기서 B3 로 다시 본다
// 기사는 발행 2030 년으로 넣어 다른 시험의 행과 섞이지 않게 한다. EXTRACT 대기 · 최근 15분 수는 표 전체를 세니 시작 값과의 차이로 본다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@TestPropertySource(
        properties = {
            "newlearn.internal.worker-key=worker-key-for-candidates-test",
            "newlearn.internal.batch-key=" + ReleaseCandidatesIntegrationTest.BATCH_KEY
        })
class ReleaseCandidatesIntegrationTest {

    static final String BATCH_KEY = "batch-key-for-candidates-test";
    static final String PRESS = "cand156";
    static final String FROM = "2030-01-01";
    static final long EVENT = 3301;

    // KST 2030-01-01 0시 = UTC 2029-12-31 15:00
    static final String KST_MIDNIGHT = "2029-12-31T15:00:00Z";
    static final String KST_BEFORE_MIDNIGHT = "2029-12-31T14:59:59Z";

    // 오늘(KST) 0시 — DB 시각으로 B3 와 같은 식
    static final String TODAY_START = "date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    JsonMapper jsonMapper;

    @BeforeEach
    void fixtures() {
        jdbc.sql("insert into press values (:code, '후보시험신문')")
                .param("code", PRESS)
                .update();
        // 라벨 표는 인프라 SQL(infra/server/category-labels-load.sql)이 만든다 — 시험 DB 에는 없으니 같은 모양으로 만든다
        jdbc.sql("create schema if not exists category_label").update();
        jdbc.sql("create table if not exists category_label.article_label (url text primary key, label text not null)")
                .update();
    }

    @AfterEach
    void cleanUp() {
        jdbc.sql("delete from category_label.article_label where url like 'https://fixture.invalid/cand156/%'")
                .update();
        jdbc.sql("delete from article_event where article_id between 3301 and 3399")
                .update();
        jdbc.sql("delete from event where id = :id").param("id", EVENT).update();
        jdbc.sql("delete from analysis_job where article_id between 3301 and 3399")
                .update();
        jdbc.sql("delete from article where id between 3301 and 3399").update();
        jdbc.sql("delete from press where code = :code").param("code", PRESS).update();
    }

    // 후보 = 발행이 publishedFrom(KST 0시) 이후 · 공개 전 · 작업 행 없음 · 사건 연결 없음 · 라벨 행 없음
    @Test
    void candidatesSkipReleasedJobbedLinkedAndLabelledArticles() throws Exception {
        article(3301, KST_MIDNIGHT, "now()", false); // 후보 — KST 0시 딱 그때
        article(3302, KST_BEFORE_MIDNIGHT, "now()", false); // KST 전날 23:59:59 — 빠짐
        article(3303, "2030-01-02T00:00:00Z", "now()", true); // 이미 공개 — 빠짐
        article(3304, "2030-01-02T00:00:00Z", "now()", false); // 작업 행 있음 — 빠짐
        job(3304, "EMBED", "QUEUED", 1, "now()", null, null, "now()");
        article(3305, "2030-01-02T00:00:00Z", "now()", false); // 사건 연결 있음 — 빠짐
        linkToEvent(3305);
        article(3306, "2030-01-02T00:00:00Z", "now()", false); // 라벨 행 있음(숨긴 X) — 빠짐
        label(3306, "X");

        List<Long> ids = candidateIds(b3(FROM, 50).andExpect(status().isOk()));

        assertThat(ids).containsExactly(3301L);
    }

    // 넣은 시각(created_at) 최신 순 — 그 회차가 방금 넣은 기사가 맨 앞, 같으면 번호 큰 것부터. limit 만큼만
    @Test
    void candidatesAreNewestInsertedFirstAndLimited() throws Exception {
        article(3311, "2030-01-01T05:00:00Z", "now() - interval '10 minutes'", false);
        article(3312, "2030-01-01T03:00:00Z", "now() - interval '5 minutes'", false); // 발행은 이르지만 넣은 건 늦다
        article(3313, "2030-01-01T04:00:00Z", "now() - interval '5 minutes'", false);

        assertThat(candidateIds(b3(FROM, 50).andExpect(status().isOk()))).containsExactly(3313L, 3312L, 3311L);
        assertThat(candidateIds(b3(FROM, 2).andExpect(status().isOk()))).containsExactly(3313L, 3312L);
    }

    // 오늘 건 수 = 오늘(KST) 만든 EXTRACT 작업, 기사 발행이 publishedFrom 이후인 것만. 재시도는 같은 행이라 한 번
    @Test
    void releasedTodayCountsTodaysExtractJobsOfArticlesAfterCutoff() throws Exception {
        article(3321, "2030-01-02T00:00:00Z", "now()", false);
        job(3321, "EXTRACT", "QUEUED", 2, TODAY_START, null, null, "now()"); // 오늘 0시 · 재시도 시도 2 — 1
        job(3321, "EMBED", "QUEUED", 1, TODAY_START, null, null, "now()"); // EMBED — 안 셈
        article(3322, "2030-01-02T00:00:00Z", "now()", false);
        job(
                3322,
                "EXTRACT",
                "SUCCEEDED",
                1,
                TODAY_START + " - interval '1 second'",
                "now()",
                null,
                "now()"); // 어제 — 안 셈
        article(3323, KST_BEFORE_MIDNIGHT, "now()", false);
        job(3323, "EXTRACT", "SUCCEEDED", 1, "now()", "now()", null, "now()"); // 적재 모양: 오늘 만들었지만 기사가 마감 전 — 안 셈

        JsonNode body = read(b3(FROM, 50).andExpect(status().isOk()));

        assertThat(body.get("releasedToday").asLong()).isEqualTo(1);
    }

    // EXTRACT 대기 = QUEUED + 다시 걸 예정인 FAILED. 가장 오래 기다림은 QUEUED 만. EMBED 는 안 셈. 최근 15분 성공 · 실패는 따로
    @Test
    void extractStateCountsQueuedRetryPendingAndRecentFinishes() throws Exception {
        JsonNode before = read(b3(FROM, 1).andExpect(status().isOk())).get("extract");

        article(3331, KST_BEFORE_MIDNIGHT, "now()", false);
        job(3331, "EXTRACT", "QUEUED", 1, "now()", null, null, "'2000-01-01T00:00:00Z'"); // 가장 오래 기다림
        job(3331, "EMBED", "QUEUED", 1, "now()", null, null, "'1999-01-01T00:00:00Z'"); // EMBED — 대기 · 기다림에 안 셈
        article(3332, KST_BEFORE_MIDNIGHT, "now()", false);
        job(
                3332,
                "EXTRACT",
                "FAILED",
                1,
                "now()",
                "now() - interval '1 minute'",
                "now() + interval '5 minutes'",
                "now()");
        article(3333, KST_BEFORE_MIDNIGHT, "now()", false);
        job(3333, "EXTRACT", "FAILED", 3, "now()", "now() - interval '2 minutes'", null, "'1998-01-01T00:00:00Z'");
        article(3334, KST_BEFORE_MIDNIGHT, "now()", false);
        job(3334, "EXTRACT", "SUCCEEDED", 1, "now()", "now() - interval '5 minutes'", null, "now()");
        article(3335, KST_BEFORE_MIDNIGHT, "now()", false);
        job(3335, "EXTRACT", "SUCCEEDED", 1, "now()", "now() - interval '20 minutes'", null, "now()"); // 15분 밖

        JsonNode after = read(b3(FROM, 1).andExpect(status().isOk())).get("extract");

        assertThat(diff(before, after, "queued")).isEqualTo(1);
        assertThat(diff(before, after, "retryPending")).isEqualTo(1); // 다시 걸지 않는 실패(3333)는 대기가 아니다
        assertThat(diff(before, after, "succeededLast15Minutes")).isEqualTo(1);
        assertThat(diff(before, after, "failedLast15Minutes")).isEqualTo(2);
        assertThat(after.get("oldestQueuedAt").asString()).isEqualTo("2000-01-01T09:00:00+09:00");
    }

    // 시각은 다른 응답처럼 +09:00
    @Test
    void timesAreKst() throws Exception {
        article(3341, KST_MIDNIGHT, "now()", false);

        b3(FROM, 50)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.candidates[0].articleId").value(3341))
                .andExpect(jsonPath("$.candidates[0].publishedAt").value("2030-01-01T00:00:00+09:00"));
    }

    // 배치 출입증으로만 연다 — 워커 키 403, 키 없음 401
    @Test
    void onlyTheBatchKeyOpensB3() throws Exception {
        mvc.perform(get("/internal/v1/articles/release-candidates")
                        .param("publishedFrom", FROM)
                        .param("limit", "50")
                        .header("X-Internal-Key", "worker-key-for-candidates-test"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mvc.perform(get("/internal/v1/articles/release-candidates")
                        .param("publishedFrom", FROM)
                        .param("limit", "50"))
                .andExpect(status().isUnauthorized());
    }

    // 날짜 모양 · limit 1 ~ 500 · 빠진 인자는 400
    @Test
    void badParametersAre400() throws Exception {
        b3("2030-13-01", 50)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        b3(FROM, 0)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        b3(FROM, 501)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        b3(FROM, 500).andExpect(status().isOk());
        mvc.perform(get("/internal/v1/articles/release-candidates")
                        .param("limit", "50")
                        .header("X-Internal-Key", BATCH_KEY))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    private ResultActions b3(String publishedFrom, int limit) throws Exception {
        return mvc.perform(get("/internal/v1/articles/release-candidates")
                .param("publishedFrom", publishedFrom)
                .param("limit", String.valueOf(limit))
                .header("X-Internal-Key", BATCH_KEY));
    }

    private JsonNode read(ResultActions result) throws Exception {
        return jsonMapper.readTree(result.andReturn().getResponse().getContentAsString());
    }

    private List<Long> candidateIds(ResultActions result) throws Exception {
        List<Long> ids = new ArrayList<>();
        JsonNode candidates = read(result).get("candidates");
        for (int i = 0; i < candidates.size(); i++) {
            ids.add(candidates.get(i).get("articleId").asLong());
        }
        return ids;
    }

    private static long diff(JsonNode before, JsonNode after, String field) {
        return after.get(field).asLong() - before.get(field).asLong();
    }

    // createdAt 은 SQL 식(넣은 시각 순서를 보려고)
    private void article(long id, String publishedAt, String createdAt, boolean released) {
        jdbc.sql("""
                insert into article(id,source,url,press_code,title,body,published_at,released_at,created_at)
                values (:id,'NEWSDATA',:url,:press,:title,'본문',cast(:published as timestamptz),
                    case when :released then now() else null end,%s)
                """.formatted(createdAt))
                .param("id", id)
                .param("url", url(id))
                .param("press", PRESS)
                .param("title", "후보 기사 " + id)
                .param("published", publishedAt)
                .param("released", released)
                .update();
    }

    // 시각 칸은 SQL 식. finishedAt · retryAt 은 null 이면 비운다
    private void job(
            long articleId,
            String stage,
            String jobStatus,
            int attempt,
            String createdAt,
            @Nullable String finishedAt,
            @Nullable String retryAt,
            String queuedAt) {
        jdbc.sql("""
                insert into analysis_job(article_id,stage,status,requested_by,attempt,created_at,finished_at,retry_at,queued_at)
                values (:article,:stage,:status,'BATCH',:attempt,%s,%s,%s,%s)
                """.formatted(createdAt, nullable(finishedAt), nullable(retryAt), queuedAt))
                .param("article", articleId)
                .param("stage", stage)
                .param("status", jobStatus)
                .param("attempt", attempt)
                .update();
    }

    private void linkToEvent(long articleId) {
        jdbc.sql("""
                insert into event(id,issue_id,title,label,occurred_at,occurred_at_basis,created_at,updated_at,role)
                values (:id,null,'후보 시험 사건','후보',now(),'FIRST_PUBLISHED',now(),now(),'MAIN')
                on conflict (id) do nothing
                """).param("id", EVENT).update();
        jdbc.sql("insert into article_event(article_id,event_id,linked_at) values (:article,:event,now())")
                .param("article", articleId)
                .param("event", EVENT)
                .update();
    }

    private void label(long articleId, String code) {
        jdbc.sql("insert into category_label.article_label(url,label) values (:url,:label)")
                .param("url", url(articleId))
                .param("label", code)
                .update();
    }

    private static String url(long id) {
        return "https://fixture.invalid/cand156/" + id;
    }

    private static String nullable(@Nullable String sql) {
        return sql == null ? "null" : sql;
    }
}
