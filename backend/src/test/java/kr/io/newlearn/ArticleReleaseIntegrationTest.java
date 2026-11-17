package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import kr.io.newlearn.analysis.queue.AnalysisStreams;
import kr.io.newlearn.common.error.ApiException;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.ingest.ArticleReleaseService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Range;
import org.springframework.data.redis.connection.Limit;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// B1 기사 투입 (Jira 34, docs/api-internal.md 2절). 실제 PostgreSQL · Redis 로 본다
// 투입은 분석만 건다 — 기사가 보이는 때는 EXTRACT 결과를 처음 저장한 때다(2026-10-26 사용자, AnalysisJobQueueIntegrationTest)
// 커밋 뒤 큐에 넣기를 보려고 @Transactional 을 붙이지 않고, 만든 행은 끝날 때 지운다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@TestPropertySource(
        properties = {
            "newlearn.internal.worker-key=worker-key-for-release-test",
            "newlearn.internal.batch-key=" + ArticleReleaseIntegrationTest.BATCH_KEY
        })
class ArticleReleaseIntegrationTest {

    static final String BATCH_KEY = "batch-key-for-release-test";
    static final String PRESS = "release34";
    static final long ARTICLE = 3201;

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    StringRedisTemplate redis;

    @Autowired
    JsonMapper jsonMapper;

    @Autowired
    ArticleReleaseService releases;

    @BeforeEach
    void fixtures() {
        jdbc.sql("insert into press values (:code, '투입시험신문')")
                .param("code", PRESS)
                .update();
        article(ARTICLE, false);
    }

    @AfterEach
    void cleanUp() {
        jdbc.sql("delete from analysis_job where article_id between 3201 and 3299")
                .update();
        jdbc.sql("delete from article where id between 3201 and 3299").update();
        jdbc.sql("delete from press where code = :code").param("code", PRESS).update();
    }

    // 202 와 만든 작업 둘. 커밋 뒤 투입 메시지 하나가 큐에 들어가고, 기사는 아직 화면에 없다(분석이 끝나야 보인다)
    @Test
    void releaseQueuesExtractAndEmbedButKeepsTheArticleHidden() throws Exception {
        Long before = redis.opsForStream().size(AnalysisStreams.RELEASED);
        String body = b1(ARTICLE, BATCH_KEY)
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.articleId").value(ARTICLE))
                .andExpect(jsonPath("$.jobs[0].stage").value("EXTRACT"))
                .andExpect(jsonPath("$.jobs[1].stage").value("EMBED"))
                .andExpect(jsonPath("$.jobs[0].attempt").value(1))
                .andExpect(jsonPath("$.jobs[1].attempt").value(1))
                .andReturn()
                .getResponse()
                .getContentAsString();

        JsonNode response = jsonMapper.readTree(body);
        long extract = response.get("jobs").get(0).get("jobId").asLong();
        long embed = response.get("jobs").get(1).get("jobId").asLong();
        assertThat(jobIds(ARTICLE)).containsExactlyInAnyOrder(extract, embed);

        assertThat(redis.opsForStream().size(AnalysisStreams.RELEASED)).isEqualTo(before + 1); // 메시지 하나
        JsonNode message = lastReleasedMessage();
        assertThat(message.get("articleId").asLong()).isEqualTo(ARTICLE);
        assertThat(message.get("jobs").get("EXTRACT").asLong()).isEqualTo(extract);
        assertThat(message.get("jobs").get("EMBED").asLong()).isEqualTo(embed);

        assertThat(releasedAtIsSet(ARTICLE)).isFalse();
        mvc.perform(get("/api/v1/articles/{id}", ARTICLE)).andExpect(status().isNotFound());
    }

    // 같은 기사를 또 투입하면 409 — 작업을 더 만들지 않는다. 배치는 건너뛴다
    @Test
    void secondReleaseIs409() throws Exception {
        b1(ARTICLE, BATCH_KEY).andExpect(status().isAccepted());
        b1(ARTICLE, BATCH_KEY)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_RELEASED"));
        assertThat(jobIds(ARTICLE)).hasSize(2);
    }

    // 이미 화면에 있는 기사(공개 시각이 있음)도 409
    @Test
    void alreadyPublicArticleIs409() throws Exception {
        article(3202, true);
        b1(3202, BATCH_KEY)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_RELEASED"));
        assertThat(jobIds(3202)).isEmpty();
    }

    @Test
    void unknownArticleIs404() throws Exception {
        b1(999_999, BATCH_KEY)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ARTICLE_NOT_FOUND"));
    }

    // B1 은 배치 출입증으로만 연다
    @Test
    void workerKeyCannotRelease() throws Exception {
        b1(ARTICLE, "worker-key-for-release-test")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        assertThat(jobIds(ARTICLE)).isEmpty();
    }

    // 같은 기사 투입 둘이 동시에 와도 하나만 통과하고 나머지는 409 다(기사 행을 잠그고 본다)
    @Test
    void concurrentReleasesQueueOnce() throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Future<String>> runs = new ArrayList<>();
        try {
            for (int i = 0; i < 2; i++) {
                runs.add(pool.submit(() -> {
                    start.await();
                    try {
                        releases.release(ARTICLE);
                        return "OK";
                    } catch (ApiException e) {
                        return e.errorCode().name();
                    }
                }));
            }
            start.countDown();
            List<String> results = new ArrayList<>();
            for (Future<String> run : runs) {
                results.add(run.get());
            }
            assertThat(results).containsExactlyInAnyOrder("OK", ErrorCode.ALREADY_RELEASED.name());
        } finally {
            pool.shutdownNow();
        }
        assertThat(jobIds(ARTICLE)).hasSize(2);
    }

    private ResultActions b1(long articleId, String key) throws Exception {
        return mvc.perform(
                post("/internal/v1/articles/{articleId}/release", articleId).header("X-Internal-Key", key));
    }

    private void article(long id, boolean released) {
        jdbc.sql("""
                insert into article(id,source,url,press_code,title,body,published_at,released_at,created_at)
                values (:id,'NEWSDATA',:url,:press,:title,'본문','2026-10-06T01:12:00Z',
                    case when :released then now() else null end,now())
                """)
                .param("id", id)
                .param("url", "https://fixture.invalid/release34/" + id)
                .param("press", PRESS)
                .param("title", "투입 기사 " + id)
                .param("released", released)
                .update();
    }

    private List<Long> jobIds(long articleId) {
        return jdbc.sql("select id from analysis_job where article_id = :id")
                .param("id", articleId)
                .query(Long.class)
                .list();
    }

    private boolean releasedAtIsSet(long articleId) {
        return jdbc.sql("select released_at is not null from article where id = :id")
                .param("id", articleId)
                .query(Boolean.class)
                .single();
    }

    private JsonNode lastReleasedMessage() {
        List<MapRecord<String, Object, Object>> last = redis.opsForStream()
                .reverseRange(
                        AnalysisStreams.RELEASED,
                        Range.unbounded(),
                        Limit.limit().count(1));
        assertThat(last).hasSize(1);
        return jsonMapper.readTree((String) last.getFirst().getValue().get("payload"));
    }
}
