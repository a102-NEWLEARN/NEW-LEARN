package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import kr.io.newlearn.analysis.AnalysisJob;
import kr.io.newlearn.analysis.AnalysisJobRecovery;
import kr.io.newlearn.analysis.AnalysisJobService;
import kr.io.newlearn.analysis.AnalysisResultHandler;
import kr.io.newlearn.analysis.AnalysisResultHandlers;
import kr.io.newlearn.analysis.AnalysisStage;
import kr.io.newlearn.analysis.ResultSchemaInvalidException;
import kr.io.newlearn.analysis.dto.JobResultRequest;
import kr.io.newlearn.analysis.issue.IssueDispatcher;
import kr.io.newlearn.analysis.match.MatchDispatcher;
import kr.io.newlearn.analysis.queue.AnalysisStreams;
import kr.io.newlearn.analysis.queue.JobPublisher;
import kr.io.newlearn.analysis.queue.StreamGroupsInitializer;
import kr.io.newlearn.article.ArticleRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Range;
import org.springframework.data.redis.connection.Limit;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.connection.stream.StreamReadOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 분석 작업 큐 · W1 · 다시 걸기 (Jira 30, docs/api-internal.md 3 ~ 6절). 실제 PostgreSQL · Redis 로 본다
// 커밋 뒤 큐에 넣기를 보려면 트랜잭션이 정말 커밋돼야 해서 @Transactional 을 붙이지 않고, 만든 행은 끝날 때 지운다
// 단계별 결과 저장(처리기)은 56 · 35 · 40 몫이라 처리기 묶음을 가짜로 바꿔 끼운다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@TestPropertySource(
        properties = {
            "newlearn.internal.worker-key=" + AnalysisJobQueueIntegrationTest.WORKER_KEY,
            "newlearn.internal.batch-key=batch-key-for-queue-test",
            "newlearn.analysis.queue.max-length=10"
        })
class AnalysisJobQueueIntegrationTest {

    static final String WORKER_KEY = "worker-key-for-queue-test";
    static final String PRESS = "queue30";
    static final long ARTICLE = 3001;
    static final Instant T0 = Instant.parse("2026-10-26T00:00:00Z");

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    StringRedisTemplate redis;

    @Autowired
    JsonMapper jsonMapper;

    @Autowired
    AnalysisJobService service;

    @Autowired
    AnalysisJobRecovery recovery;

    @Autowired
    ArticleRepository articles;

    // 진짜로 넣되, 넣기 실패 경로를 볼 때만 던지게 한다
    @MockitoSpyBean
    JobPublisher publisher;

    // W1 뒤 고르기가 실패하는 경로를 볼 때만 던지게 한다
    @MockitoSpyBean
    MatchDispatcher matches;

    @MockitoSpyBean
    IssueDispatcher issues;

    @Autowired
    StreamGroupsInitializer groups;

    @Autowired
    PlatformTransactionManager transactions;

    @MockitoBean
    AnalysisResultHandlers handlers;

    TransactionTemplate tx;

    @BeforeEach
    void fixtures() {
        tx = new TransactionTemplate(transactions);
        jdbc.sql("insert into press values (:code, '큐시험신문')")
                .param("code", PRESS)
                .update();
        article(ARTICLE);
    }

    @AfterEach
    void cleanUp() {
        jdbc.sql("delete from analysis_job where article_id between 3001 and 3199")
                .update();
        jdbc.sql("delete from article where id between 3001 and 3199").update();
        jdbc.sql("delete from press where code = :code").param("code", PRESS).update();
    }

    // 뜰 때 스트림 셋 · 그룹 넷을 만든다
    @Test
    void streamsAndGroupsExistAfterStartup() {
        assertThat(groupNames(AnalysisStreams.RELEASED)).contains("extract", "embed");
        assertThat(groupNames(AnalysisStreams.MATCH_EVENT)).contains("match_event");
        assertThat(groupNames(AnalysisStreams.ISSUE)).contains("issue");
    }

    // 투입 — EXTRACT · EMBED 작업을 만들고, 커밋 뒤 본문을 담은 메시지 하나를 넣고, 넣었다고 적는다
    @Test
    void releaseIsQueuedAfterCommitWithTheArticleBody() {
        List<AnalysisJob> created =
                tx.execute(s -> service.queueRelease(articles.findById(ARTICLE).orElseThrow()));
        assertThat(created).hasSize(2);

        JsonNode message = lastMessage(AnalysisStreams.RELEASED);
        assertThat(message.get("articleId").asLong()).isEqualTo(ARTICLE);
        assertThat(message.get("attempt").asInt()).isEqualTo(1);
        assertThat(message.get("jobs").get("EXTRACT").asLong())
                .isEqualTo(created.get(0).getId());
        assertThat(message.get("jobs").get("EMBED").asLong())
                .isEqualTo(created.get(1).getId());
        assertThat(message.get("article").get("title").asString()).isEqualTo("큐 기사 3001");
        assertThat(message.get("article").get("publisher").asString()).isEqualTo("큐시험신문");
        assertThat(message.get("article").get("publishedAt").asString()).isEqualTo("2026-10-06T10:12:00+09:00");
        assertThat(message.get("article").get("body").asString()).isEqualTo("본문 3001");
        assertThat(unpublishedJobs(ARTICLE)).isZero();
    }

    // 작업 행을 저장한 트랜잭션이 되돌아가면 큐에도 넣지 않는다 — 워커가 없는 작업을 받지 않게
    @Test
    void rolledBackReleaseIsNotQueued() {
        Long before = redis.opsForStream().size(AnalysisStreams.RELEASED);
        tx.executeWithoutResult(s -> {
            service.queueRelease(articles.findById(ARTICLE).orElseThrow());
            s.setRollbackOnly();
        });
        assertThat(redis.opsForStream().size(AnalysisStreams.RELEASED)).isEqualTo(before);
        assertThat(jobCount(ARTICLE)).isZero();
    }

    // ACKED MAXLEN ~ N — 한 그룹이라도 ack 하지 않은 메시지는 남고, 모든 그룹이 ack 하면 잘린다(시험은 N = 10)
    // ~ 는 내부 덩어리(100개) 단위로 잘라서 넉넉히 넣는다
    @Test
    void trimsOnlyWhatEveryGroupAcknowledged() {
        String stream = "test.trim." + UUID.randomUUID();
        try {
            groups.createGroups(stream, List.of("a", "b"));
            for (int i = 0; i < 250; i++) {
                publisher.publish(stream, "{\"n\":" + i + "}");
            }
            ackAll(stream, "a");
            publisher.publish(stream, "{\"n\":250}");
            assertThat(redis.opsForStream().size(stream)).isEqualTo(251);

            ackAll(stream, "b");
            publisher.publish(stream, "{\"n\":251}");
            assertThat(redis.opsForStream().size(stream)).isLessThan(251);
        } finally {
            redis.delete(stream);
        }
    }

    @Test
    void unknownJobIs404() throws Exception {
        w1(999_999, envelope(1, "FAILED", "null", error("LLM_TIMEOUT")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ANALYSIS_JOB_NOT_FOUND"));
    }

    // 늦게 온 옛 결과 · 이미 끝난 작업 · 같은 결과 두 번째는 409 — 새 결과를 덮지 않는다
    @Test
    void wrongAttemptOrFinishedJobIs409() throws Exception {
        long job = job(ARTICLE, "EXTRACT", "QUEUED", 2, null, null, T0, T0, null);
        w1(job, envelope(1, "FAILED", "null", error("LLM_TIMEOUT")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("JOB_STATE_CONFLICT"));

        long done = job(ARTICLE, "EMBED", "SUCCEEDED", 1, null, T0, T0, T0, null);
        w1(done, envelope(1, "FAILED", "null", error("LLM_TIMEOUT")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("JOB_STATE_CONFLICT"));
    }

    // FAILED 봉투의 error.code · message 에 U+0000 이 있으면 결과 모양이 틀린 것으로 거절한다(400, 바로 한 번 더) —
    // PostgreSQL 이 이 글자를 받지 않아 그대로 남기면 저장에서 터진다 (Jira 143)
    @ParameterizedTest(name = "{0}")
    @ValueSource(
            strings = {
                "{\"code\": \"LLM\\u0000TIMEOUT\", \"message\": \"느림\"}",
                "{\"code\": \"LLM_TIMEOUT\", \"message\": \"느\\u0000림\"}"
            })
    void failureWithNulIsRejected(String error) throws Exception {
        long job = job(ARTICLE, "EXTRACT", "QUEUED", 1, null, null, T0, T0, null);

        w1(job, envelope(1, "FAILED", "null", error))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESULT_SCHEMA_INVALID"));

        assertThat(row(job))
                .containsEntry("status", "QUEUED")
                .containsEntry("attempt", 2)
                .containsEntry("error_code", "RESULT_SCHEMA_INVALID");
    }

    // 실패를 받으면 코드 · 설명을 남긴다. 늦춰 걸 코드는 지금 걸지 않고 스케줄러가 건다
    @Test
    void failureIsStoredAndLeftForTheScheduler() throws Exception {
        long job = job(ARTICLE, "EXTRACT", "QUEUED", 1, null, null, T0, T0, null);
        Instant before = Instant.now();
        Long length = redis.opsForStream().size(AnalysisStreams.RELEASED);
        w1(job, envelope(1, "FAILED", "null", error("LLM_TIMEOUT"))).andExpect(status().isNoContent());

        Map<String, Object> row = row(job);
        assertThat(row).containsEntry("status", "FAILED").containsEntry("attempt", 1);
        assertThat(row).containsEntry("error_code", "LLM_TIMEOUT").containsEntry("error_message", "느림");
        // 다시 걸 때는 API 가 받은 때부터 1분 뒤(워커가 보낸 finishedAt 이 아니라)
        assertThat(((java.sql.Timestamp) row.get("retry_at")).toInstant())
                .isBetween(before.plusSeconds(60), Instant.now().plusSeconds(60));
        assertThat(redis.opsForStream().size(AnalysisStreams.RELEASED)).isEqualTo(length);
    }

    // 성공은 처리기에 넘겨 저장하고 SUCCEEDED. 같은 결과가 또 오면 409
    @Test
    void successGoesThroughTheHandlerOnce() throws Exception {
        AtomicInteger saved = new AtomicInteger();
        handle(AnalysisStage.EXTRACT, (job, request) -> saved.incrementAndGet());
        long job = job(ARTICLE, "EXTRACT", "QUEUED", 1, null, null, T0, T0, null);

        String body = envelope(1, "SUCCEEDED", "{\"summary\":null}", "null");
        w1(job, body).andExpect(status().isNoContent());
        w1(job, body).andExpect(status().isConflict());

        assertThat(saved).hasValue(1);
        assertThat(row(job)).containsEntry("status", "SUCCEEDED").containsEntry("error_code", null);
    }

    // 기사가 보이는 때는 EXTRACT 결과를 처음 저장한 때다(2026-10-26 사용자 — 분석이 끝난 뒤부터, Jira 34)
    // 그 전에는 화면 단건 조회(A8)도 404 이고, 성공하면 보인다. 다시 분석해 성공해도 처음 공개 시각은 그대로
    @Test
    void extractSuccessReleasesTheArticleOnce() throws Exception {
        handle(AnalysisStage.EXTRACT, (job, request) -> {});
        long job = job(ARTICLE, "EXTRACT", "QUEUED", 1, null, null, T0, T0, null);
        mvc.perform(get("/api/v1/articles/{id}", ARTICLE)).andExpect(status().isNotFound());

        w1(job, envelope(1, "SUCCEEDED", "{}", "null")).andExpect(status().isNoContent());
        Object first = releasedAt(ARTICLE);
        assertThat(first).isNotNull();
        mvc.perform(get("/api/v1/articles/{id}", ARTICLE)).andExpect(status().isOk());

        jdbc.sql("update analysis_job set status = 'QUEUED', attempt = 2 where id = :id")
                .param("id", job)
                .update();
        w1(job, envelope(2, "SUCCEEDED", "{}", "null")).andExpect(status().isNoContent());
        assertThat(releasedAt(ARTICLE)).isEqualTo(first);
    }

    // EXTRACT 가 실패하거나 다른 단계(EMBED)가 성공해서는 공개되지 않는다
    @Test
    void onlyExtractSuccessReleases() throws Exception {
        handle(AnalysisStage.EMBED, (job, request) -> {});
        long extract = job(ARTICLE, "EXTRACT", "QUEUED", 1, null, null, T0, T0, null);
        long embed = job(ARTICLE, "EMBED", "QUEUED", 1, null, null, T0, T0, null);

        w1(extract, envelope(1, "FAILED", "null", error("INPUT_NOT_ANALYZABLE")))
                .andExpect(status().isNoContent());
        w1(embed, envelope(1, "SUCCEEDED", "{}", "null")).andExpect(status().isNoContent());

        assertThat(releasedAt(ARTICLE)).isNull();
        mvc.perform(get("/api/v1/articles/{id}", ARTICLE)).andExpect(status().isNotFound());
    }

    // 처리기가 결과를 거절하면 처리기가 쓴 것은 되돌리고, RESULT_SCHEMA_INVALID 로 남긴 뒤 바로 한 번 더 건다.
    // 다시 건 시도도 거절되면 멈춘다
    @Test
    void rejectedResultIsRolledBackRetriedOnceThenStops() throws Exception {
        handle(AnalysisStage.EXTRACT, (job, request) -> {
            jdbc.sql("update article set title = '처리기가 바꿈' where id = :id")
                    .param("id", ARTICLE)
                    .update();
            throw new ResultSchemaInvalidException("가지가 하나도 없다");
        });
        long job = job(ARTICLE, "EXTRACT", "QUEUED", 1, null, null, T0, T0, null);

        w1(job, envelope(1, "SUCCEEDED", "{}", "null"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESULT_SCHEMA_INVALID"));
        assertThat(title(ARTICLE)).isEqualTo("큐 기사 3001");
        assertThat(releasedAt(ARTICLE)).isNull(); // 거절되면 공개 단계까지 가지 않는다
        assertThat(row(job))
                .containsEntry("status", "QUEUED")
                .containsEntry("attempt", 2)
                .containsEntry("error_code", "RESULT_SCHEMA_INVALID");
        JsonNode retry = lastMessage(AnalysisStreams.RELEASED);
        assertThat(retry.get("attempt").asInt()).isEqualTo(2);
        assertThat(retry.get("jobs").properties()).hasSize(1);
        assertThat(retry.get("jobs").get("EXTRACT").asLong()).isEqualTo(job);
        assertThat(unpublishedJobs(ARTICLE)).isZero();

        w1(job, envelope(2, "SUCCEEDED", "{}", "null")).andExpect(status().isBadRequest());
        assertThat(row(job)).containsEntry("status", "FAILED").containsEntry("attempt", 2);
        assertThat(row(job).get("retry_at")).isNull(); // 다시 걸지 않으니 스케줄러가 읽지 않는다
    }

    // 처리기의 예상 밖 오류(버그 · 처리기 없음)는 INTERNAL 로 실패를 남기고 500. 1분 뒤 한 번만 더 걸리고,
    // 워커가 같은 결과를 다시 보내면 409 라 ack 한다 — QUEUED 로 남아 GMS 를 끝없이 부르지 않게
    @Test
    void unexpectedHandlerErrorIsRecordedAsInternal() throws Exception {
        handle(AnalysisStage.EXTRACT, (job, request) -> {
            throw new IllegalStateException("처리기 버그");
        });
        long job = job(ARTICLE, "EXTRACT", "QUEUED", 1, null, null, T0, T0, null);
        String body = envelope(1, "SUCCEEDED", "{}", "null");

        w1(job, body).andExpect(status().isInternalServerError());
        Map<String, Object> row = row(job);
        assertThat(row)
                .containsEntry("status", "FAILED")
                .containsEntry("attempt", 1)
                .containsEntry("error_code", "INTERNAL");
        assertThat(row.get("retry_at")).isNotNull();
        w1(job, body).andExpect(status().isConflict());
    }

    // 봉투 안끼리 안 맞으면(성공인데 result 없음) 처리기가 거절한 것과 같다. 봉투를 못 읽거나 attempt 가 없으면 작업은 그대로
    @Test
    void badEnvelopesAre400() throws Exception {
        long job = job(ARTICLE, "EXTRACT", "QUEUED", 1, null, null, T0, T0, null);
        w1(job, envelope(1, "SUCCEEDED", "null", "null"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESULT_SCHEMA_INVALID"));
        assertThat(row(job)).containsEntry("status", "QUEUED").containsEntry("attempt", 2);

        w1(job, envelope(2, "DONE", "null", "null"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESULT_SCHEMA_INVALID"));
        w1(job, "{\"status\":\"FAILED\",\"error\":{\"code\":\"LLM_TIMEOUT\"}}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESULT_SCHEMA_INVALID"));
        assertThat(row(job)).containsEntry("status", "QUEUED").containsEntry("attempt", 2);
    }

    // 간격(LLM_TIMEOUT 첫 실패 뒤 1분)이 지나기 전에는 안 걸고, 지나면 attempt + 1 로 한 번 걸어 큐에 넣는다
    @Test
    void failureIsRetriedAfterItsDelayOnce() {
        long job = job(ARTICLE, "EXTRACT", "FAILED", 1, "LLM_TIMEOUT", T0, T0, T0, T0.plusSeconds(60));

        assertThat(recovery.retryDue(T0.plusSeconds(59))).isZero();
        assertThat(row(job)).containsEntry("status", "FAILED");

        assertThat(recovery.retryDue(T0.plusSeconds(61))).isEqualTo(1);
        assertThat(row(job)).containsEntry("status", "QUEUED").containsEntry("attempt", 2);
        assertThat(row(job).get("published_at")).isNotNull();
        JsonNode message = lastMessage(AnalysisStreams.RELEASED);
        assertThat(message.get("attempt").asInt()).isEqualTo(2);
        assertThat(message.get("jobs").get("EXTRACT").asLong()).isEqualTo(job);

        assertThat(recovery.retryDue(T0.plus(Duration.ofHours(1)))).isZero();
    }

    // 최대 시도 수 · 「한 번만 더」 코드 · 다시 걸지 않는 코드는 아무리 지나도 그대로
    @Test
    void retriesStopWhereThePolicySays() {
        long limit = job(ARTICLE, "EXTRACT", "FAILED", 3, "LLM_TIMEOUT", T0, T0, T0, null);
        long once = job(ARTICLE, "EMBED", "FAILED", 2, "LLM_OUTPUT_INVALID", T0, T0, T0, null);
        long refused = job(article(3002), "EXTRACT", "FAILED", 1, "LLM_REFUSED", T0, T0, T0, null);

        assertThat(recovery.retryDue(T0.plus(Duration.ofDays(1)))).isZero();
        assertThat(row(limit)).containsEntry("status", "FAILED").containsEntry("attempt", 3);
        assertThat(row(once)).containsEntry("status", "FAILED").containsEntry("attempt", 2);
        assertThat(row(refused)).containsEntry("status", "FAILED").containsEntry("attempt", 1);
    }

    // 다시 걸지 않는 실패가 아무리 쌓여도(한 차례 100개보다 많이) 때가 된 실패는 걸린다
    @Test
    void stoppedFailuresDoNotBlockDueRetries() {
        jdbc.sql("""
                insert into article(id,source,url,press_code,title,body,published_at,released_at,created_at)
                select n,'NEWSDATA','https://fixture.invalid/queue30/' || n,:press,'멈춘 기사','본문',now(),now(),now()
                from generate_series(3100, 3159) n
                """).param("press", PRESS).update();
        jdbc.sql("""
                insert into analysis_job(article_id,stage,status,requested_by,attempt,error_code,created_at,finished_at)
                select n, s, 'FAILED', 'BATCH', 2, 'LLM_OUTPUT_INVALID', now(), :t0
                from generate_series(3100, 3159) n, (values ('EXTRACT'), ('EMBED')) as stages(s)
                """).param("t0", java.sql.Timestamp.from(T0)).update();
        long due = job(ARTICLE, "EXTRACT", "FAILED", 1, "LLM_TIMEOUT", T0, T0, T0, T0.plusSeconds(60));

        assertThat(recovery.retryDue(T0.plus(Duration.ofHours(1)))).isEqualTo(1);
        assertThat(row(due)).containsEntry("status", "QUEUED").containsEntry("attempt", 2);
    }

    // 배포 중 Pod 둘이 스케줄러를 같이 돌려도 한 번만 다시 건다
    @Test
    void concurrentSchedulersRetryOnce() throws Exception {
        long job = job(ARTICLE, "EXTRACT", "FAILED", 1, "LLM_TIMEOUT", T0, T0, T0, T0.plusSeconds(60));
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Integer>> runs = List.of(
                    pool.submit(() -> {
                        start.await();
                        return recovery.retryDue(T0.plusSeconds(61));
                    }),
                    pool.submit(() -> {
                        start.await();
                        return recovery.retryDue(T0.plusSeconds(61));
                    }));
            start.countDown();
            assertThat(runs.get(0).get() + runs.get(1).get()).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
        assertThat(row(job)).containsEntry("status", "QUEUED").containsEntry("attempt", 2);
    }

    // 큐에 못 넣은 작업 — 1분 기다렸다가 한 번만 넣는다. 넣은 작업은 다시 넣지 않는다
    @Test
    void unpublishedJobIsPublishedAfterAMinuteOnce() {
        long job = job(ARTICLE, "EXTRACT", "QUEUED", 1, null, null, T0, null, null);

        assertThat(recovery.publishUnpublished(T0.plusSeconds(30))).isZero();
        assertThat(row(job).get("published_at")).isNull();

        assertThat(recovery.publishUnpublished(T0.plusSeconds(61))).isEqualTo(1);
        assertThat(row(job).get("published_at")).isNotNull();
        JsonNode message = lastMessage(AnalysisStreams.RELEASED);
        assertThat(message.get("jobs").get("EXTRACT").asLong()).isEqualTo(job);

        assertThat(recovery.publishUnpublished(T0.plus(Duration.ofHours(1)))).isZero();
    }

    // 큐에 다시 넣다 실패하면(Redis 끊김) 표시를 지우고 그 차례를 멈춘다 — 다음 차례에 둘 다 다시 넣는다
    @Test
    void publishFailureUnmarksAndStopsTheRound() {
        long first = job(ARTICLE, "EXTRACT", "QUEUED", 1, null, null, T0, null, null);
        article(3002);
        long second = job(3002, "EXTRACT", "QUEUED", 1, null, null, T0, null, null);
        doThrow(new IllegalStateException("Redis 끊김"))
                .when(publisher)
                .publish(eq(AnalysisStreams.RELEASED), anyString());

        assertThat(recovery.publishUnpublished(T0.plusSeconds(61))).isZero();

        verify(publisher, times(1)).publish(eq(AnalysisStreams.RELEASED), anyString());
        assertThat(row(first).get("published_at")).isNull();
        assertThat(row(second).get("published_at")).isNull();
    }

    // W1 뒤 고르기가 실패해도 W1 응답은 그대로다 — 1분 스케줄러가 다시 고른다
    @Test
    void dispatchFailureAfterW1KeepsTheResponse() throws Exception {
        handle(AnalysisStage.EXTRACT, (job, request) -> {});
        long job = job(ARTICLE, "EXTRACT", "QUEUED", 1, null, null, T0, T0, null);
        doThrow(new IllegalStateException("판정 고르기 실패")).when(matches).next();
        doThrow(new IllegalStateException("ISSUE 고르기 실패")).when(issues).next();

        w1(job, envelope(1, "SUCCEEDED", "{}", "null")).andExpect(status().isNoContent());

        verify(matches).next();
        verify(issues).next();
        assertThat(row(job)).containsEntry("status", "SUCCEEDED");
    }

    // 결과를 거절한 W1 도 같다 — 고르기가 실패해도 400 과 RESULT_SCHEMA_INVALID 기록(바로 다시 걸기)은 그대로다
    @Test
    void dispatchFailureAfterRejectedW1KeepsTheRejection() throws Exception {
        handle(AnalysisStage.EXTRACT, (job, request) -> {
            throw new ResultSchemaInvalidException("가지가 하나도 없다");
        });
        long job = job(ARTICLE, "EXTRACT", "QUEUED", 1, null, null, T0, T0, null);
        doThrow(new IllegalStateException("판정 고르기 실패")).when(matches).next();
        doThrow(new IllegalStateException("ISSUE 고르기 실패")).when(issues).next();

        w1(job, envelope(1, "SUCCEEDED", "{}", "null"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESULT_SCHEMA_INVALID"));

        verify(matches).next();
        verify(issues).next();
        assertThat(row(job))
                .containsEntry("status", "QUEUED")
                .containsEntry("attempt", 2)
                .containsEntry("error_code", "RESULT_SCHEMA_INVALID");
    }

    // 후보가 빈 ISSUE 대기 작업은 아예 읽지 않는다 — 고르기만 넣는다(Jira 40, 그 전에는 ISSUE 에 메시지 공장이 없었다).
    // 판정(NEW)이 만든 대기 작업이 한 번에 읽는 수(100)보다 많이 쌓여도, 다른 단계의 못 넣은 작업이 그 뒤에 막히지 않는다 (Jira 35)
    @Test
    void waitingIssueJobsDoNotCrowdOutOthers() {
        for (long id = 3100; id < 3200; id++) {
            article(id);
            job(id, "ISSUE", "QUEUED", 1, null, null, T0.minus(Duration.ofHours(1)), null, null);
        }
        long extract = job(ARTICLE, "EXTRACT", "QUEUED", 1, null, null, T0, null, null);

        assertThat(recovery.publishUnpublished(T0.plusSeconds(61))).isEqualTo(1);
        assertThat(row(extract).get("published_at")).isNotNull();
    }

    private void handle(AnalysisStage stage, Save save) {
        when(handlers.forStage(any())).thenReturn(new AnalysisResultHandler() {
            @Override
            public AnalysisStage stage() {
                return stage;
            }

            @Override
            public void save(AnalysisJob job, JobResultRequest request) {
                save.save(job, request);
            }
        });
    }

    // 시험용 처리기 몸통
    interface Save {
        void save(AnalysisJob job, JobResultRequest request);
    }

    private ResultActions w1(long jobId, String body) throws Exception {
        return mvc.perform(post("/internal/v1/analysis-jobs/{jobId}/result", jobId)
                .header("X-Internal-Key", WORKER_KEY)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private static String envelope(int attempt, String status, String result, String error) {
        return """
                {"attempt": %d, "status": "%s", "model": "gpt-6-luna", "promptVersion": "extract-v1",
                 "startedAt": "2026-10-26T09:00:00+09:00", "finishedAt": "2026-10-26T09:00:30+09:00",
                 "result": %s, "error": %s}
                """.formatted(attempt, status, result, error);
    }

    private static String error(String code) {
        return "{\"code\": \"" + code + "\", \"message\": \"느림\"}";
    }

    private long article(long id) {
        jdbc.sql("""
                insert into article(id,source,url,press_code,title,body,published_at,created_at)
                values (:id,'NEWSDATA',:url,:press,:title,:body,'2026-10-06T01:12:00Z',now())
                """)
                .param("id", id)
                .param("url", "https://fixture.invalid/queue30/" + id)
                .param("press", PRESS)
                .param("title", "큐 기사 " + id)
                .param("body", "본문 " + id)
                .update();
        return id;
    }

    private long job(
            long articleId,
            String stage,
            String status,
            int attempt,
            String errorCode,
            Instant finishedAt,
            Instant queuedAt,
            Instant publishedAt,
            Instant retryAt) {
        return jdbc.sql("""
                insert into analysis_job(article_id,stage,status,requested_by,attempt,error_code,created_at,
                    finished_at,queued_at,published_at,retry_at)
                values (:article,:stage,:status,'BATCH',:attempt,:code,now(),:finished,:queued,:published,:retry)
                returning id
                """)
                .param("article", articleId)
                .param("stage", stage)
                .param("status", status)
                .param("attempt", attempt)
                .param("code", errorCode)
                .param("finished", finishedAt == null ? null : java.sql.Timestamp.from(finishedAt))
                .param("queued", java.sql.Timestamp.from(queuedAt))
                .param("published", publishedAt == null ? null : java.sql.Timestamp.from(publishedAt))
                .param("retry", retryAt == null ? null : java.sql.Timestamp.from(retryAt))
                .query(Long.class)
                .single();
    }

    private Map<String, Object> row(long jobId) {
        return jdbc.sql("""
                select status, attempt, error_code, error_message, published_at, retry_at from analysis_job where id = :id
                """).param("id", jobId).query().singleRow();
    }

    private Object releasedAt(long articleId) {
        return jdbc.sql("select released_at from article where id = :id")
                .param("id", articleId)
                .query(java.sql.Timestamp.class)
                .list()
                .getFirst();
    }

    private String title(long articleId) {
        return jdbc.sql("select title from article where id = :id")
                .param("id", articleId)
                .query(String.class)
                .single();
    }

    private int jobCount(long articleId) {
        return jdbc.sql("select count(*) from analysis_job where article_id = :id")
                .param("id", articleId)
                .query(Integer.class)
                .single();
    }

    private int unpublishedJobs(long articleId) {
        return jdbc.sql("select count(*) from analysis_job where article_id = :id and published_at is null")
                .param("id", articleId)
                .query(Integer.class)
                .single();
    }

    private List<String> groupNames(String stream) {
        return redis.opsForStream().groups(stream).stream()
                .map(group -> group.groupName())
                .toList();
    }

    private JsonNode lastMessage(String stream) {
        List<MapRecord<String, Object, Object>> last = redis.opsForStream()
                .reverseRange(stream, Range.unbounded(), Limit.limit().count(1));
        assertThat(last).hasSize(1);
        return jsonMapper.readTree((String) last.getFirst().getValue().get("payload"));
    }

    // read 는 StreamOffset<K>... 가변 인자만 받아 하나만 넘겨도 제네릭 배열이 생긴다 — 읽기만 해서 안전하다
    @SuppressWarnings("unchecked")
    private void ackAll(String stream, String group) {
        List<MapRecord<String, Object, Object>> read = redis.opsForStream()
                .read(
                        Consumer.from(group, "test"),
                        StreamReadOptions.empty().count(1000),
                        StreamOffset.create(stream, ReadOffset.lastConsumed()));
        RecordId[] ids = read.stream().map(MapRecord::getId).toArray(RecordId[]::new);
        redis.opsForStream().acknowledge(stream, group, ids);
    }
}
