package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// W1 EXTRACT 결과 저장 → 마인드맵 (Jira 56, docs/specs/F03-F04-mindmap.md). 진짜 처리기와 실제 PostgreSQL · Redis 로 본다
// W1 은 커밋까지 가야 결과가 보여서 @Transactional 을 붙이지 않고, 만든 행은 끝날 때 지운다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@TestPropertySource(
        properties = {
            "newlearn.internal.worker-key=" + MindmapApiIntegrationTest.WORKER_KEY,
            "newlearn.internal.batch-key=batch-key-for-mindmap-test"
        })
class MindmapApiIntegrationTest {

    static final String WORKER_KEY = "worker-key-for-mindmap-test";
    static final String PRESS = "mindmap56";
    static final long ARTICLE = 5601;
    static final String BODY = "한빛반도체가 6일 텍사스 공장 착공식을 열었다.\n\n2028년 양산 목표는 그대로라고 밝혔다.";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    JsonMapper jsonMapper;

    @BeforeEach
    void fixtures() {
        jdbc.sql("insert into press values (:code, '마인드맵시험신문')")
                .param("code", PRESS)
                .update();
        jdbc.sql("""
                insert into article(id,source,url,press_code,title,body,published_at,created_at)
                values (:id,'NEWSDATA',:url,:press,'마인드맵 기사',:body,'2026-10-06T01:12:00Z',now())
                """)
                .param("id", ARTICLE)
                .param("url", "https://fixture.invalid/mindmap56/" + ARTICLE)
                .param("press", PRESS)
                .param("body", BODY)
                .update();
    }

    @AfterEach
    void cleanUp() {
        // article_mindmap 의 외래 키에 on delete 가 없어 기사보다 먼저 지운다
        jdbc.sql("delete from article_mindmap where article_id between 5601 and 5699")
                .update();
        jdbc.sql("delete from analysis_job where article_id between 5601 and 5699")
                .update();
        jdbc.sql("delete from article where id between 5601 and 5699").update();
        jdbc.sql("delete from press where code = :code").param("code", PRESS).update();
    }

    // AC-1 · AC-2 · AC-4 — 저장하고 공개한다. 본문과 맞는 근거만 남고 잎은 다 남는다. 가지는 표 순서로
    @Test
    void extractSuccessStoresTheMindmapAndReleasesTheArticle() throws Exception {
        long job = extractJob(1);

        w1(job, envelope(1, "\"gpt-6-luna\"", """
                                {"summary": "텍사스 공장 착공", "schemaVersion": "mindmap-v1",
                                 "mindmap": {"title": null, "branches": [
                                   {"type": "OUTLOOK", "items": [{"text": "2028년 양산",
                                     "evidence": [{"text": "2028년 양산 목표는 그대로라고 밝혔다.", "paragraphIndex": 1, "sentenceIndex": 0}]}]},
                                   {"type": "CORE", "items": [
                                     {"text": "착공식을 열었다", "evidence": [
                                       {"text": "6일 텍사스 공장 착공식을 열었다", "paragraphIndex": 0, "sentenceIndex": 0},
                                       {"text": "7일 텍사스 공장 착공식을 열었다", "paragraphIndex": 0, "sentenceIndex": 0},
                                       {"text": "착공식을 열었다", "paragraphIndex": 9, "sentenceIndex": 0},
                                       {"text": "모양이 틀림"}]},
                                     {"text": "보조금 조건을 맞췄다"}]}]},
                                 "primaryCoreIndex": 0, "occurredAt": "2026-10-06T00:00:00+09:00"}
                                """)).andExpect(status().isNoContent());

        Map<String, Object> row = mindmapRow();
        assertThat(row)
                .containsEntry("summary", "텍사스 공장 착공")
                .containsEntry("schema_version", "mindmap-v1")
                .containsEntry("model", "gpt-6-luna")
                .containsEntry("prompt_version", "extract-v1")
                .containsEntry("primary_core_index", 0);
        assertThat(instant("occurred_at")).isEqualTo(Instant.parse("2026-10-05T15:00:00Z"));
        assertThat(instant("generated_at")).isEqualTo(Instant.parse("2026-10-26T00:00:30Z")); // 봉투의 finishedAt

        JsonNode content = content();
        assertThat(content.get("branches").get(0).get("type").asString()).isEqualTo("CORE");
        assertThat(content.get("branches").get(1).get("type").asString()).isEqualTo("OUTLOOK");
        JsonNode core = content.get("branches").get(0).get("items");
        assertThat(core.size()).isEqualTo(2);
        assertThat(core.get(0).get("evidence").size()).isEqualTo(1);
        assertThat(core.get(0).get("evidence").get(0).get("text").asString()).isEqualTo("6일 텍사스 공장 착공식을 열었다");
        assertThat(core.get(1).get("evidence").size()).isZero();
        assertThat(content.get("branches")
                        .get(1)
                        .get("items")
                        .get(0)
                        .get("evidence")
                        .size())
                .isEqualTo(1);

        assertThat(releasedAt()).isNotNull();
        assertThat(jobStatus(job)).isEqualTo("SUCCEEDED");
    }

    // AC-3 — 거절이면 아무것도 저장하지 않고 공개하지 않는다. 시도 2 를 바로 건다
    @Test
    void rejectedResultStoresNothingAndRetriesOnce() throws Exception {
        long job = extractJob(1);

        w1(job, envelope(1, "\"gpt-6-luna\"", """
                        {"schemaVersion": "mindmap-v1", "mindmap": {"branches": []}}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESULT_SCHEMA_INVALID"));

        assertThat(mindmapCount()).isZero();
        assertThat(releasedAt()).isNull();
        assertThat(jdbc.sql("select attempt from analysis_job where id = :id")
                        .param("id", job)
                        .query(Integer.class)
                        .single())
                .isEqualTo(2);
    }

    // AC-3 — EXTRACT 는 model · promptVersion 이 DB 에서 필수다. 비어 오면 500 대신 거절
    @Test
    void extractWithoutModelIsRejected() throws Exception {
        long job = extractJob(1);

        w1(job, envelope(1, "null", """
                        {"schemaVersion": "mindmap-v1", "mindmap": {"branches": [{"type": "CORE", "items": [{"text": "잎"}]}]}}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESULT_SCHEMA_INVALID"));

        assertThat(mindmapCount()).isZero();
    }

    // AC-5 · AC-4 — 이미 마인드맵이 있으면 덮어쓴다. 공개 시각은 그대로. 대표 사건이 없으면 시점도 비운다
    @Test
    void successOverwritesAnExistingMindmapAndKeepsTheReleaseTime() throws Exception {
        jdbc.sql("update article set released_at = '2026-10-06T02:00:00Z' where id = :id")
                .param("id", ARTICLE)
                .update();
        jdbc.sql("""
                insert into article_mindmap(article_id,summary,content,primary_core_index,occurred_at,schema_version,
                    model,prompt_version,generated_at)
                values (:id,'옛 요약','{"title": null, "branches": []}',0,'2026-10-05T15:00:00Z','mindmap-v1',
                    'gpt-5-mini','extract-v0','2026-10-06T01:13:05Z')
                """).param("id", ARTICLE).update();
        long job = extractJob(1);

        w1(job, envelope(1, "\"gpt-6-luna\"", """
                                {"summary": "새 요약", "schemaVersion": "mindmap-v1",
                                 "mindmap": {"branches": [{"type": "CAUSE", "items": [{"text": "보조금 조건"}]}]},
                                 "primaryCoreIndex": null, "occurredAt": "2026-10-06T00:00:00+09:00"}
                                """)).andExpect(status().isNoContent());

        assertThat(mindmapCount()).isEqualTo(1);
        assertThat(mindmapRow())
                .containsEntry("summary", "새 요약")
                .containsEntry("model", "gpt-6-luna")
                .containsEntry("prompt_version", "extract-v1")
                .containsEntry("primary_core_index", null)
                .containsEntry("occurred_at", null);
        assertThat(content().get("branches").get(0).get("type").asString()).isEqualTo("CAUSE");
        assertThat(releasedAt()).isEqualTo(Instant.parse("2026-10-06T02:00:00Z"));
    }

    private long extractJob(int attempt) {
        return jdbc.sql("""
                insert into analysis_job(article_id,stage,status,requested_by,attempt,created_at,queued_at,published_at)
                values (:article,'EXTRACT','QUEUED','BATCH',:attempt,now(),now(),now())
                returning id
                """)
                .param("article", ARTICLE)
                .param("attempt", attempt)
                .query(Long.class)
                .single();
    }

    private ResultActions w1(long jobId, String body) throws Exception {
        return mvc.perform(post("/internal/v1/analysis-jobs/{jobId}/result", jobId)
                .header("X-Internal-Key", WORKER_KEY)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    // model 은 JSON 글자 그대로 넣는다 — 「"gpt-6-luna"」 또는 「null」
    private static String envelope(int attempt, String model, String result) {
        return """
                {"attempt": %d, "status": "SUCCEEDED", "model": %s, "promptVersion": "extract-v1",
                 "startedAt": "2026-10-26T09:00:00+09:00", "finishedAt": "2026-10-26T09:00:30+09:00",
                 "result": %s, "error": null}
                """.formatted(attempt, model, result);
    }

    private Map<String, Object> mindmapRow() {
        return jdbc.sql("""
                select summary, schema_version, model, prompt_version, primary_core_index, occurred_at
                from article_mindmap where article_id = :id
                """).param("id", ARTICLE).query().singleRow();
    }

    private Instant instant(String column) {
        return jdbc.sql("select " + column + " from article_mindmap where article_id = :id")
                .param("id", ARTICLE)
                .query(OffsetDateTime.class)
                .single()
                .toInstant();
    }

    private JsonNode content() {
        return jsonMapper.readTree(jdbc.sql("select content::text from article_mindmap where article_id = :id")
                .param("id", ARTICLE)
                .query(String.class)
                .single());
    }

    private int mindmapCount() {
        return jdbc.sql("select count(*) from article_mindmap where article_id = :id")
                .param("id", ARTICLE)
                .query(Integer.class)
                .single();
    }

    private Instant releasedAt() {
        return jdbc.sql("select released_at from article where id = :id")
                .param("id", ARTICLE)
                .query(OffsetDateTime.class)
                .optional()
                .map(OffsetDateTime::toInstant)
                .orElse(null);
    }

    private String jobStatus(long jobId) {
        return jdbc.sql("select status from analysis_job where id = :id")
                .param("id", jobId)
                .query(String.class)
                .single();
    }
}
