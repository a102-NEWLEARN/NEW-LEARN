package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.stream.Collectors;
import java.util.stream.IntStream;
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

// W1 EMBED · MATCH_EVENT → 기사 벡터 · 후보 사건 · 판정 (Jira 35, docs/specs/F06-event-match.md)
// 진짜 처리기와 실제 PostgreSQL(pgvector) · Redis 로 본다. W1 은 커밋까지 가야 결과가 보여서 @Transactional 을 붙이지 않고,
// 만든 행은 끝날 때 지운다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@TestPropertySource(
        properties = {
            "newlearn.internal.worker-key=" + EventMatchIntegrationTest.WORKER_KEY,
            "newlearn.internal.batch-key=batch-key-for-event-match-test"
        })
class EventMatchIntegrationTest {

    static final String WORKER_KEY = "worker-key-for-event-match-test";
    static final String PRESS = "match35";
    static final long ARTICLE = 3501;

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @BeforeEach
    void fixtures() {
        jdbc.sql("insert into press values (:code, '판정시험신문')")
                .param("code", PRESS)
                .update();
        article(ARTICLE, "2026-10-06T01:00:00Z");
    }

    @AfterEach
    void cleanUp() {
        // 외래 키에 on delete 가 없어 기사보다 먼저 지운다
        jdbc.sql("delete from article_embedding where article_id between 3501 and 3599")
                .update();
        jdbc.sql("delete from analysis_job where article_id between 3501 and 3599")
                .update();
        jdbc.sql("delete from article where id between 3501 and 3599").update();
        jdbc.sql("delete from press where code = :code").param("code", PRESS).update();
    }

    // AC-1 — EMBED 결과를 저장한다
    @Test
    void embedSuccessStoresTheVector() throws Exception {
        long job = job(ARTICLE, "EMBED", 1);

        w1(job, envelope(1, embedResult("BGE-m3-ko", 1024))).andExpect(status().isNoContent());

        assertThat(embeddingModel(ARTICLE)).isEqualTo("BGE-m3-ko");
        assertThat(jdbc.sql("select vector_dims(embedding) from article_embedding where article_id = :id")
                        .param("id", ARTICLE)
                        .query(Integer.class)
                        .single())
                .isEqualTo(1024);
        assertThat(jdbc.sql("select (embedding::real[])[4] from article_embedding where article_id = :id")
                        .param("id", ARTICLE)
                        .query(Double.class)
                        .single())
                .isCloseTo(0.003, org.assertj.core.data.Offset.offset(1e-6));
    }

    // AC-1 — 다시 오면 덮어쓴다(행은 하나)
    @Test
    void embedAgainOverwritesTheVector() throws Exception {
        long job = job(ARTICLE, "EMBED", 1);
        w1(job, envelope(1, embedResult("BGE-m3-ko", 1024))).andExpect(status().isNoContent());
        jdbc.sql("update analysis_job set status = 'QUEUED', attempt = 2 where id = :id")
                .param("id", job)
                .update();

        w1(job, envelope(2, embedResult("BGE-m3-ko-v2", 1024))).andExpect(status().isNoContent());

        assertThat(embeddingModel(ARTICLE)).isEqualTo("BGE-m3-ko-v2");
        assertThat(jdbc.sql("select count(*) from article_embedding where article_id = :id")
                        .param("id", ARTICLE)
                        .query(Integer.class)
                        .single())
                .isEqualTo(1);
    }

    // AC-1 · AC-8 — 차원이 다르면 400, 저장하지 않고 한 번 다시 건다
    @Test
    void embedWithWrongDimensionIsRejected() throws Exception {
        long job = job(ARTICLE, "EMBED", 1);

        w1(job, envelope(1, embedResult("all-MiniLM", 384)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESULT_SCHEMA_INVALID"));

        assertThat(jdbc.sql("select count(*) from article_embedding where article_id = :id")
                        .param("id", ARTICLE)
                        .query(Integer.class)
                        .single())
                .isZero();
        assertThat(jdbc.sql("select attempt from analysis_job where id = :id")
                        .param("id", job)
                        .query(Integer.class)
                        .single())
                .isEqualTo(2);
    }

    private void article(long id, String publishedAt) {
        jdbc.sql("""
                insert into article(id,source,url,press_code,title,body,published_at,created_at)
                values (:id,'NEWSDATA',:url,:press,:title,'본문',cast(:published as timestamptz),now())
                """)
                .param("id", id)
                .param("url", "https://fixture.invalid/match35/" + id)
                .param("press", PRESS)
                .param("title", "판정 기사 " + id)
                .param("published", publishedAt)
                .update();
    }

    private long job(long articleId, String stage, int attempt) {
        return jdbc.sql("""
                insert into analysis_job(article_id,stage,status,requested_by,attempt,created_at,queued_at,published_at)
                values (:article,:stage,'QUEUED','BATCH',:attempt,now(),now(),now())
                returning id
                """)
                .param("article", articleId)
                .param("stage", stage)
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

    // 임베딩은 프롬프트가 없어 promptVersion 이 null 이다 (api-internal.md 5절 봉투)
    private static String envelope(int attempt, String result) {
        return """
                {"attempt": %d, "status": "SUCCEEDED", "model": "BGE-m3-ko", "promptVersion": null,
                 "startedAt": "2026-10-26T09:00:00+09:00", "finishedAt": "2026-10-26T09:00:30+09:00",
                 "result": %s, "error": null}
                """.formatted(attempt, result);
    }

    // 값은 0.001 · i — i 번째 칸(0부터)이 0.001 · i
    private static String embedResult(String model, int dimension) {
        String vector = IntStream.range(0, dimension)
                .mapToObj(i -> String.valueOf(0.001 * i))
                .collect(Collectors.joining(",", "[", "]"));
        return """
                {"model": "%s", "dimension": %d, "vector": %s}""".formatted(model, dimension, vector);
    }

    private String embeddingModel(long articleId) {
        return jdbc.sql("select model from article_embedding where article_id = :id")
                .param("id", articleId)
                .query(String.class)
                .single();
    }
}
