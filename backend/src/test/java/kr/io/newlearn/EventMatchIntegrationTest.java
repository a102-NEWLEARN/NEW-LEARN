package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import kr.io.newlearn.analysis.AnalysisJobService;
import kr.io.newlearn.analysis.queue.AnalysisStreams;
import org.assertj.core.data.Offset;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Range;
import org.springframework.data.redis.connection.Limit;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// W1 EMBED · MATCH_EVENT → 기사 벡터 · 후보 사건 · 판정 (Jira 35, docs/specs/F06-event-match.md)
// 진짜 처리기와 실제 PostgreSQL(pgvector) · Redis 로 본다. W1 은 커밋까지 가야 결과가 보여서 @Transactional 을 붙이지 않고,
// 만든 행은 끝날 때 지운다. 시험 설정은 1분 스케줄러를 꺼 두었다 — 판정 고르기는 W1 뒤와 dispatchMatch() 로 부른다
@SpringBootTest
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
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

    @Autowired
    StringRedisTemplate redis;

    @Autowired
    JsonMapper jsonMapper;

    @Autowired
    AnalysisJobService service;

    @BeforeEach
    void fixtures() {
        jdbc.sql("insert into press values (:code, '판정시험신문')")
                .param("code", PRESS)
                .update();
        article(ARTICLE, "2026-10-06T01:00:00Z");
    }

    @AfterEach
    void cleanUp() {
        // 판정(NEW)이 만든 사건은 DB 가 번호를 매겨 3501 ~ 3599 밖이다 — 연결을 지우기 전에 번호를 모아 둔다
        List<Long> created = jdbc.sql("""
                select event_id from article_event
                where article_id between 3501 and 3599 and event_id not between 3501 and 3599
                """).query(Long.class).list();
        // 외래 키에 on delete 가 없어 기사 · 사건보다 먼저 지운다
        jdbc.sql("delete from article_event where article_id between 3501 and 3599")
                .update();
        jdbc.sql("delete from event where id between 3501 and 3599").update();
        if (!created.isEmpty()) {
            jdbc.sql("delete from event where id in (:ids)")
                    .param("ids", created)
                    .update();
        }
        jdbc.sql("delete from article_embedding where article_id between 3501 and 3599")
                .update();
        jdbc.sql("delete from article_mindmap where article_id between 3501 and 3599")
                .update();
        jdbc.sql("delete from analysis_job where article_id between 3501 and 3599")
                .update();
        jdbc.sql("delete from article where id between 3501 and 3599").update();
        jdbc.sql("delete from press where code = :code").param("code", PRESS).update();
    }

    // ── 커밋 1: EMBED 저장 ──

    // AC-1 — EMBED 결과를 저장한다
    @Test
    void embedSuccessStoresTheVector() throws Exception {
        long job = job(ARTICLE, "EMBED", "QUEUED", 1);

        w1(job, envelope(1, null, embedResult("BGE-m3-ko", 1024))).andExpect(status().isNoContent());

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
                .isCloseTo(0.003, Offset.offset(1e-6));
    }

    // AC-1 — 다시 오면 덮어쓴다(행은 하나)
    @Test
    void embedAgainOverwritesTheVector() throws Exception {
        long job = job(ARTICLE, "EMBED", "QUEUED", 1);
        w1(job, envelope(1, null, embedResult("BGE-m3-ko", 1024))).andExpect(status().isNoContent());
        jdbc.sql("update analysis_job set status = 'QUEUED', attempt = 2 where id = :id")
                .param("id", job)
                .update();

        w1(job, envelope(2, null, embedResult("BGE-m3-ko-v2", 1024))).andExpect(status().isNoContent());

        assertThat(embeddingModel(ARTICLE)).isEqualTo("BGE-m3-ko-v2");
        assertThat(count("select count(*) from article_embedding where article_id = " + ARTICLE))
                .isEqualTo(1);
    }

    // AC-1 · AC-8 — 차원이 다르면 400, 저장하지 않고 한 번 다시 건다
    @Test
    void embedWithWrongDimensionIsRejected() throws Exception {
        long job = job(ARTICLE, "EMBED", "QUEUED", 1);

        w1(job, envelope(1, null, embedResult("all-MiniLM", 384)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESULT_SCHEMA_INVALID"));

        assertThat(count("select count(*) from article_embedding where article_id = " + ARTICLE))
                .isZero();
        assertThat(count("select attempt from analysis_job where id = " + job)).isEqualTo(2);
    }

    // ── 커밋 2: 판정 걸기 ──

    // AC-2 — EXTRACT 만 끝나서는 걸지 않고, EMBED 까지 끝나면 건다(후보 · 메시지와 함께)
    @Test
    void matchIsQueuedAfterBothExtractAndEmbedSucceed() throws Exception {
        long extract = job(ARTICLE, "EXTRACT", "QUEUED", 1);
        long embed = job(ARTICLE, "EMBED", "QUEUED", 1);

        w1(extract, envelope(1, "extract-v1", extractResult(0))).andExpect(status().isNoContent());
        assertThat(matchJobs(ARTICLE)).isZero();

        w1(embed, envelope(1, null, embedAt(0))).andExpect(status().isNoContent());
        assertThat(matchJobs(ARTICLE)).isEqualTo(1);
        assertThat(matchStatus(ARTICLE)).isEqualTo("QUEUED");
        JsonNode message = lastMessage(AnalysisStreams.MATCH_EVENT);
        assertThat(message.get("articleId").asLong()).isEqualTo(ARTICLE);
        assertThat(message.get("attempt").asInt()).isEqualTo(1);
    }

    // AC-2 — 어느 쪽이 나중에 끝나도 건다(EMBED 먼저 → EXTRACT 나중)
    @Test
    void matchIsQueuedWhicheverFinishesLast() throws Exception {
        long extract = job(ARTICLE, "EXTRACT", "QUEUED", 1);
        long embed = job(ARTICLE, "EMBED", "QUEUED", 1);

        w1(embed, envelope(1, null, embedAt(0))).andExpect(status().isNoContent());
        assertThat(matchJobs(ARTICLE)).isZero();

        w1(extract, envelope(1, "extract-v1", extractResult(0))).andExpect(status().isNoContent());
        assertThat(matchJobs(ARTICLE)).isEqualTo(1);
    }

    // AC-2 — 대표 사건이 없거나 이미 사건에 묶인 기사는 판정하지 않는다
    @Test
    void noMatchWithoutPrimaryCoreOrWhenAlreadyLinked() {
        ready(ARTICLE, 0);
        jdbc.sql("update article_mindmap set primary_core_index = null where article_id = :id")
                .param("id", ARTICLE)
                .update();
        article(3502, "2026-10-06T02:00:00Z");
        ready(3502, 0);
        link(3502, event(3551, "이미 있는 사건"), "2026-10-06T03:00:00Z");

        service.dispatchMatch();

        assertThat(matchJobs(ARTICLE)).isZero();
        assertThat(matchJobs(3502)).isZero();
    }

    // AC-3 — 한 번에 하나씩, 발행 시각이 이른 기사부터. 진행 중(QUEUED · 다시 걸 예정)이면 기다리고, 멈춘 실패는 넘어간다
    @Test
    void matchesOneAtATimeInPublishedOrder() {
        article(3502, "2026-10-06T00:30:00Z"); // ARTICLE 보다 먼저 발행
        ready(ARTICLE, 0);
        ready(3502, 10);

        service.dispatchMatch();
        assertThat(matchJobs(3502)).isEqualTo(1);
        assertThat(matchJobs(ARTICLE)).isZero();

        service.dispatchMatch(); // 3502 가 QUEUED — 기다린다
        assertThat(matchJobs(ARTICLE)).isZero();

        setMatch(3502, "FAILED", "now() + interval '5 minutes'"); // 다시 걸 예정 — 여전히 기다린다
        service.dispatchMatch();
        assertThat(matchJobs(ARTICLE)).isZero();

        setMatch(3502, "FAILED", "null"); // 멈춘 실패 — 넘어간다
        service.dispatchMatch();
        assertThat(matchJobs(ARTICLE)).isEqualTo(1);
    }

    // AC-4 — 후보는 기사 벡터가 가까운 사건 5개, 가까운 순서. 사건은 그 사건 기사 중 가장 가까운 것으로 잰다
    @Test
    void candidatesAreTheNearestFiveEvents() throws Exception {
        ready(ARTICLE, 0);
        // 사건 7개를 0° ~ 60° 에 하나씩. 사건 번호는 각도와 거꾸로(0° 가 3557) — 거리 대신 번호로 줄 세우면 갈린다.
        // 3557 에는 먼 기사(80°)도 하나 더 — 가까운 기사(0°)로 잰다
        for (int i = 0; i < 7; i++) {
            long articleId = 3510L + i;
            article(articleId, "2026-10-05T0" + i + ":00:00Z");
            embedding(articleId, 10.0 * i);
            link(articleId, event(3557L - i, "사건 " + i), "2026-10-05T0" + i + ":30:00Z");
        }
        article(3520, "2026-10-05T08:00:00Z");
        embedding(3520, 80);
        link(3520, 3557, "2026-10-05T08:30:00Z");

        service.dispatchMatch();

        JsonNode candidates = jsonMapper.readTree(
                jdbc.sql("select candidates::text from analysis_job where article_id = :id and stage = 'MATCH_EVENT'")
                        .param("id", ARTICLE)
                        .query(String.class)
                        .single());
        assertThat(candidates.size()).isEqualTo(5);
        assertThat(candidates.findValues("eventId").stream().map(JsonNode::asLong))
                .containsExactly(3557L, 3556L, 3555L, 3554L, 3553L);
        assertThat(candidates.get(0).get("similarity").asDouble()).isCloseTo(1.0, Offset.offset(1e-4));
        assertThat(candidates.get(1).get("similarity").asDouble())
                .isCloseTo(Math.cos(Math.toRadians(10)), Offset.offset(1e-4));
        assertThat(candidates.get(4).get("similarity").asDouble())
                .isCloseTo(Math.cos(Math.toRadians(40)), Offset.offset(1e-4));
    }

    // AC-4 — 메시지에 기사 · 대표 사건(근거 포함) · 후보(첫 기사 근거 최대 3문장 · similarity)가 실린다
    @Test
    void messageCarriesThePrimaryEventAndCandidateEvidence() throws Exception {
        ready(ARTICLE, 0);
        article(3510, "2026-10-05T00:00:00Z");
        ready(3510, 20); // 사건의 첫 기사 — 근거 4개 중 3개만 실린다
        article(3511, "2026-10-05T01:00:00Z");
        embedding(3511, 5); // 나중에 붙은 기사 — 더 가깝지만 근거는 첫 기사 것
        long eventId = event(3551, "한빛반도체 착공식");
        link(3510, eventId, "2026-10-05T00:30:00Z");
        link(3511, eventId, "2026-10-05T01:30:00Z");

        service.dispatchMatch();

        JsonNode message = lastMessage(AnalysisStreams.MATCH_EVENT);
        long jobId = count("select id from analysis_job where article_id = " + ARTICLE + " and stage = 'MATCH_EVENT'");
        assertThat(message.get("articleId").asLong()).isEqualTo(ARTICLE);
        assertThat(message.get("jobId").asLong()).isEqualTo(jobId);
        assertThat(message.get("article").get("title").asString()).isEqualTo("판정 기사 " + ARTICLE);
        assertThat(message.get("article").get("publisher").asString()).isEqualTo("판정시험신문");
        assertThat(message.get("article").get("publishedAt").asString()).isEqualTo("2026-10-06T10:00:00+09:00");
        JsonNode extracted = message.get("extracted");
        assertThat(extracted.get("summary").asString()).isEqualTo("요약 " + ARTICLE);
        assertThat(extracted.get("occurredAt").asString()).isEqualTo("2026-10-06T00:00:00+09:00");
        assertThat(extracted.get("mindmap").get("branches").get(0).get("type").asString())
                .isEqualTo("CORE");
        assertThat(extracted.get("primaryEvent").get("text").asString()).isEqualTo("대표 사건 " + ARTICLE);
        assertThat(extracted.get("primaryEvent").get("evidence").size()).isEqualTo(4);
        JsonNode candidate = message.get("candidates").get(0);
        assertThat(candidate.get("eventId").asLong()).isEqualTo(eventId);
        assertThat(candidate.get("title").asString()).isEqualTo("한빛반도체 착공식");
        assertThat(candidate.get("label").asString()).isEqualTo("착공식");
        assertThat(candidate.get("summary").asString()).isEqualTo("사건 요약");
        assertThat(candidate.get("occurredAt").asString()).isEqualTo("2026-10-05T09:00:00+09:00");
        assertThat(candidate.get("evidence").values().stream().map(JsonNode::asString))
                .containsExactly("근거 3510-0", "근거 3510-1", "근거 3510-2");
        assertThat(candidate.get("similarity").asDouble()).isCloseTo(Math.cos(Math.toRadians(5)), Offset.offset(1e-4));
    }

    // AC-4 — 후보가 없어도 판정을 건다(새 사건의 이름 · 요약은 판정이 짓는다)
    @Test
    void matchIsQueuedEvenWithoutCandidates() throws Exception {
        ready(ARTICLE, 0);

        service.dispatchMatch();

        assertThat(matchJobs(ARTICLE)).isEqualTo(1);
        assertThat(lastMessage(AnalysisStreams.MATCH_EVENT).get("candidates").size())
                .isZero();
    }

    // AC-2 — EXTRACT · EMBED 결과가 동시에 와도 판정은 정확히 하나
    @Test
    void concurrentExtractAndEmbedQueueExactlyOneMatch() throws Exception {
        long extract = job(ARTICLE, "EXTRACT", "QUEUED", 1);
        long embed = job(ARTICLE, "EMBED", "QUEUED", 1);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Future<Integer>> runs = new ArrayList<>();
        try {
            runs.add(pool.submit(() -> {
                start.await();
                return w1(extract, envelope(1, "extract-v1", extractResult(0)))
                        .andReturn()
                        .getResponse()
                        .getStatus();
            }));
            runs.add(pool.submit(() -> {
                start.await();
                return w1(embed, envelope(1, null, embedAt(0)))
                        .andReturn()
                        .getResponse()
                        .getStatus();
            }));
            start.countDown();
            for (Future<Integer> run : runs) {
                assertThat(run.get()).isEqualTo(204);
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(matchJobs(ARTICLE)).isEqualTo(1);
    }

    // ── 커밋 3: 판정 결과 저장 ──

    // AC-5 · AC-7 · AC-9 — EXISTING 이면 그 사건에 붙고 이름 · 키워드 · 요약은 그대로. 본문에서 뽑은 시점(EXTRACTED)은
    // 더 이른 기사가 붙어도 당기지 않는다. 판정 기록이 남고, ISSUE 는 걸지 않고, A8 에 사건이 보인다
    @Test
    void existingLinksTheArticleAndKeepsTheEvent() throws Exception {
        ready(ARTICLE, 0);
        article(3510, "2026-10-05T00:00:00Z");
        embedding(3510, 10);
        long eventId = event(3551, "한빛반도체 착공식", "2026-10-08T00:00:00Z", "EXTRACTED");
        link(3510, eventId, "2026-10-05T00:30:00Z");
        long match = queuedMatch(ARTICLE);

        w1(match, envelope(1, "match-v1", existing(eventId))).andExpect(status().isNoContent());

        assertThat(linkedEvent(ARTICLE)).isEqualTo(eventId);
        assertThat(eventColumn(eventId, "title")).isEqualTo("한빛반도체 착공식");
        assertThat(eventColumn(eventId, "label")).isEqualTo("착공식");
        assertThat(eventColumn(eventId, "summary")).isEqualTo("사건 요약");
        assertThat(occurredAt(eventId)).isEqualTo(Instant.parse("2026-10-08T00:00:00Z"));
        assertThat(matchStatus(ARTICLE)).isEqualTo("SUCCEEDED");
        JsonNode record = matchRecord(ARTICLE);
        assertThat(record.get("reason").asString()).isEqualTo("같은 착공식이다");
        assertThat(record.get("model").asString()).isEqualTo("gpt-6-luna");
        assertThat(record.get("promptVersion").asString()).isEqualTo("match-v1");
        assertThat(count("select count(*) from analysis_job where stage = 'ISSUE' and article_id = " + ARTICLE))
                .isZero();
        jdbc.sql("update article set released_at = now() where id = :id")
                .param("id", ARTICLE)
                .update();
        mvc.perform(get("/api/v1/articles/{id}", ARTICLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.eventMatchStatus").value("SUCCEEDED"))
                .andExpect(jsonPath("$.event.id").value(eventId));
    }

    // AC-5 — 발행 시각으로 채운 시점(FIRST_PUBLISHED)은 더 이른 기사가 붙으면 그 발행 시각으로 당긴다
    @Test
    void existingPullsAFirstPublishedOccurredAtEarlier() throws Exception {
        ready(ARTICLE, 0); // 2026-10-06T01:00Z 발행
        article(3510, "2026-10-07T00:00:00Z");
        embedding(3510, 10);
        long eventId = event(3551, "한빛반도체 착공식", "2026-10-07T00:00:00Z", "FIRST_PUBLISHED");
        link(3510, eventId, "2026-10-07T00:30:00Z");
        long match = queuedMatch(ARTICLE);

        w1(match, envelope(1, "match-v1", existing(eventId))).andExpect(status().isNoContent());

        assertThat(occurredAt(eventId)).isEqualTo(Instant.parse("2026-10-06T01:00:00Z"));
        assertThat(eventColumn(eventId, "occurred_at_basis")).isEqualTo("FIRST_PUBLISHED");
    }

    // AC-6 · AC-7 — NEW 면 사건을 만들고(발생 시점 = 뽑은 시점) 기사를 붙이고 ISSUE 작업을 만든다.
    // 진행 중인 ISSUE 가 없으면 그 W1 뒤에 ISSUE 고르기가 바로 후보를 붙여 넣는다(Jira 40, F07-issue-assign.md)
    @Test
    void newCreatesTheEventAndAnIssueJob() throws Exception {
        ready(ARTICLE, 0); // 마인드맵의 occurred_at 은 2026-10-05T15:00Z
        long match = queuedMatch(ARTICLE);

        w1(match, envelope(1, "match-v1", created("착공식"))).andExpect(status().isNoContent());

        long eventId = linkedEvent(ARTICLE);
        assertThat(eventId).as("기사가 새 사건에 붙었다").isNotZero();
        assertThat(eventColumn(eventId, "title")).isEqualTo("한빛반도체 텍사스 공장 착공식");
        assertThat(eventColumn(eventId, "label")).isEqualTo("착공식");
        assertThat(eventColumn(eventId, "summary")).isEqualTo("한빛반도체가 착공식을 열었다.");
        assertThat(occurredAt(eventId)).isEqualTo(Instant.parse("2026-10-05T15:00:00Z"));
        assertThat(eventColumn(eventId, "occurred_at_basis")).isEqualTo("EXTRACTED");
        assertThat(count("select count(*) from event where issue_id is null and id = " + eventId))
                .isEqualTo(1);
        assertThat(jdbc.sql("""
                        select status || case when candidates is null or published_at is null then ' 안 넣음' else ' 넣음' end
                        from analysis_job where article_id = :id and stage = 'ISSUE'
                        """).param("id", ARTICLE).query(String.class).single())
                .isEqualTo("QUEUED 넣음");
        assertThat(matchRecord(ARTICLE).get("reason").asString()).isEqualTo("후보와 다른 사건이다");
    }

    // AC-6 — 뽑은 시점이 없으면 이 기사의 발행 시각으로 채우고 FIRST_PUBLISHED 로 적는다
    @Test
    void newWithoutAnExtractedTimeUsesThePublishedTime() throws Exception {
        ready(ARTICLE, 0);
        jdbc.sql("update article_mindmap set occurred_at = null where article_id = :id")
                .param("id", ARTICLE)
                .update();
        long match = queuedMatch(ARTICLE);

        w1(match, envelope(1, "match-v1", created("착공식"))).andExpect(status().isNoContent());

        long eventId = linkedEvent(ARTICLE);
        assertThat(eventId).as("기사가 새 사건에 붙었다").isNotZero();
        assertThat(occurredAt(eventId)).isEqualTo(Instant.parse("2026-10-06T01:00:00Z"));
        assertThat(eventColumn(eventId, "occurred_at_basis")).isEqualTo("FIRST_PUBLISHED");
    }

    // AC-8 — 보낸 후보에 없는 사건을 고르면 400, 붙이지 않고 한 번 다시 건다
    @Test
    void existingOutsideTheCandidatesIsRejected() throws Exception {
        ready(ARTICLE, 0);
        long eventId = event(3551, "묶인 기사가 없는 사건"); // 기사 벡터로 못 재서 후보에 안 들어간다
        long match = queuedMatch(ARTICLE);

        w1(match, envelope(1, "match-v1", existing(eventId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESULT_SCHEMA_INVALID"));

        assertThat(count("select count(*) from article_event where article_id = " + ARTICLE))
                .isZero();
        assertThat(count("select attempt from analysis_job where id = " + match))
                .isEqualTo(2);
        assertThat(matchStatus(ARTICLE)).isEqualTo("QUEUED");
    }

    // AC-8 — NEW 의 이름 · 키워드 · 요약에 빈 값이 있으면 400, 사건 · ISSUE 작업을 만들지 않는다
    @Test
    void newWithABlankLabelIsRejected() throws Exception {
        ready(ARTICLE, 0);
        long match = queuedMatch(ARTICLE);

        w1(match, envelope(1, "match-v1", created(" ")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESULT_SCHEMA_INVALID"));

        assertThat(count("select count(*) from article_event where article_id = " + ARTICLE))
                .isZero();
        assertThat(count("select count(*) from analysis_job where stage = 'ISSUE' and article_id = " + ARTICLE))
                .isZero();
        assertThat(count("select attempt from analysis_job where id = " + match))
                .isEqualTo(2);
    }

    // AC-12 — NEW 면 사건 역할과 반응 대상 한 줄을 사건에 저장한다. 이름 · 키워드처럼 처음 지은 그대로 두는 칸이다
    @Test
    void newStoresTheRoleAndWhatItReactsTo() throws Exception {
        ready(ARTICLE, 0);
        long match = queuedMatch(ARTICLE);

        w1(match, envelope(1, "match-v1", createdWith("비판 성명", "\"role\": \"REACTION\", \"reactsTo\": \"2차 유도 작업\"")))
                .andExpect(status().isNoContent());

        long eventId = linkedEvent(ARTICLE);
        assertThat(eventColumn(eventId, "role")).isEqualTo("REACTION");
        assertThat(eventColumn(eventId, "reacts_to")).isEqualTo("2차 유도 작업");
    }

    // AC-12 — 역할이 없거나 모르는 값(소문자 · 레인 이름 포함)이면 레인을 정할 수 없어 400, 사건을 만들지 않고 한 번 다시 건다
    @ParameterizedTest(name = "[{0}]")
    @ValueSource(strings = {"", "\"role\": null", "\"role\": \"main\"", "\"role\": \"SUB\"", "\"role\": 1"})
    void newWithoutAKnownRoleIsRejected(String roleFields) throws Exception {
        ready(ARTICLE, 0);
        long match = queuedMatch(ARTICLE);

        w1(match, envelope(1, "match-v1", createdWith("착공식", roleFields)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESULT_SCHEMA_INVALID"));

        assertThat(linkedEvent(ARTICLE)).isZero();
        assertThat(count("select attempt from analysis_job where id = " + match))
                .isEqualTo(2);
    }

    // 반응 대상 한 줄은 화면 API 로 내보내지 않는 칸이라, 담을 수 없으면 버리고 받는다. MAIN 의 것은 읽지 않는다
    static Stream<Arguments> reactsToThatCannotBeKept() {
        return Stream.of(
                Arguments.of("REACTION 인데 reactsTo 없음", "\"role\": \"REACTION\"", "REACTION"),
                Arguments.of("REACTION 인데 reactsTo 가 공백", "\"role\": \"REACTION\", \"reactsTo\": \"  \"", "REACTION"),
                Arguments.of("REACTION 인데 reactsTo 가 글자가 아님", "\"role\": \"REACTION\", \"reactsTo\": 3", "REACTION"),
                Arguments.of(
                        "REACTION 인데 reactsTo 에 U+0000",
                        "\"role\": \"REACTION\", \"reactsTo\": \"구조\\u0000작업\"",
                        "REACTION"),
                Arguments.of("MAIN 인데 reactsTo 가 옴", "\"role\": \"MAIN\", \"reactsTo\": \"구조 작업\"", "MAIN"));
    }

    // AC-12
    @ParameterizedTest(name = "{0}")
    @MethodSource("reactsToThatCannotBeKept")
    void aReactsToThatCannotBeKeptIsStoredAsNull(String why, String roleFields, String role) throws Exception {
        ready(ARTICLE, 0);
        long match = queuedMatch(ARTICLE);

        w1(match, envelope(1, "match-v1", createdWith("착공식", roleFields))).andExpect(status().isNoContent());

        long eventId = linkedEvent(ARTICLE);
        assertThat(eventColumn(eventId, "role")).isEqualTo(role);
        assertThat(count("select count(*) from event where reacts_to is null and id = " + eventId))
                .isEqualTo(1);
    }

    // AC-12 — EXISTING 의 newEvent 는 역할까지 읽지 않는다(맞지 않는 짝 칸). 붙은 사건의 역할도 그대로다
    @Test
    void existingIgnoresTheNewEventRole() throws Exception {
        ready(ARTICLE, 0);
        article(3510, "2026-10-05T00:00:00Z");
        embedding(3510, 10);
        long eventId = event(3551, "한빛반도체 착공식", "2026-10-08T00:00:00Z", "EXTRACTED");
        link(3510, eventId, "2026-10-05T00:30:00Z");
        long match = queuedMatch(ARTICLE);
        String result = """
                {"decision": "EXISTING", "eventId": %d, "reason": "같은 착공식이다",
                 "newEvent": {"role": "모르는 값", "reactsTo": "구조\\u0000작업"}}""".formatted(eventId);

        w1(match, envelope(1, "match-v1", result)).andExpect(status().isNoContent());

        assertThat(linkedEvent(ARTICLE)).isEqualTo(eventId);
        assertThat(eventColumn(eventId, "role")).isEqualTo("MAIN");
    }

    // AC-3 · AC-5 — 판정이 끝나면 바로 다음 기사가 걸리고, 앞 기사가 만든 사건이 후보에 든다.
    // 나중에 발행된 기사가 붙어도 FIRST_PUBLISHED 시점을 늦추지 않는다
    @Test
    void theNextArticleSeesTheEventTheFirstOneCreated() throws Exception {
        ready(ARTICLE, 0); // 01:00 발행
        jdbc.sql("update article_mindmap set occurred_at = null where article_id = :id")
                .param("id", ARTICLE)
                .update();
        article(3502, "2026-10-06T02:00:00Z");
        ready(3502, 5);
        long first = queuedMatch(ARTICLE);
        assertThat(matchJobs(3502)).isZero();

        w1(first, envelope(1, "match-v1", created("착공식"))).andExpect(status().isNoContent());

        long eventId = linkedEvent(ARTICLE);
        assertThat(eventId).as("기사가 새 사건에 붙었다").isNotZero();
        assertThat(matchJobs(3502)).isEqualTo(1);
        JsonNode candidates = jsonMapper.readTree(
                jdbc.sql("select candidates::text from analysis_job where article_id = 3502 and stage = 'MATCH_EVENT'")
                        .query(String.class)
                        .single());
        assertThat(candidates.findValues("eventId").stream().map(JsonNode::asLong))
                .containsExactly(eventId);

        w1(matchJobId(3502), envelope(1, "match-v1", existing(eventId))).andExpect(status().isNoContent());

        assertThat(linkedEvent(3502)).isEqualTo(eventId);
        assertThat(occurredAt(eventId)).isEqualTo(Instant.parse("2026-10-06T01:00:00Z"));
        assertThat(count(
                        "select count(*) from analysis_job where stage = 'ISSUE' and article_id between 3501 and 3502"))
                .isEqualTo(1);
    }

    // ── 리뷰 뒤 더함 ──

    // AC-3 — 판정 하나가 W1 없이 40분 넘게 QUEUED 면 판정 줄 전체가 멈춘 것일 수 있다 — 고르기가 WARN 을 남긴다.
    // 40분 안이면 평소처럼 「기다림」만 남긴다. 처리 중 워커가 죽으면 다시 가져가기(20분) + 다른 워커의 처리(15분)가 걸려서다
    @Test
    void aJudgmentStuckInQueuedIsWarned(CapturedOutput output) {
        ready(ARTICLE, 0);
        long match = queuedMatch(ARTICLE);

        jdbc.sql("update analysis_job set queued_at = now() - interval '39 minutes' where id = :id")
                .param("id", match)
                .update();
        service.dispatchMatch();
        assertThat(output.toString()).contains("판정 고르기 기다림: 판정 작업 " + match).doesNotContain("판정 줄이 멈췄을 수 있다");

        jdbc.sql("update analysis_job set queued_at = now() - interval '41 minutes' where id = :id")
                .param("id", match)
                .update();
        service.dispatchMatch();

        assertThat(output.toString()).contains("판정 줄이 멈췄을 수 있다: 판정 작업 " + match);
    }

    // AC-3 — 판정이 멈추는 실패로 끝나면(W1 FAILED, 다시 걸지 않는 코드) 그 W1 뒤에 바로 다음 기사가 걸린다
    @Test
    void aStoppedJudgmentLetsTheNextArticleGo() throws Exception {
        ready(ARTICLE, 0);
        article(3502, "2026-10-06T02:00:00Z");
        ready(3502, 5);
        long first = queuedMatch(ARTICLE);
        assertThat(matchJobs(3502)).isZero();

        w1(first, failed(1, "INPUT_NOT_ANALYZABLE")).andExpect(status().isNoContent());

        assertThat(matchStatus(ARTICLE)).isEqualTo("FAILED");
        assertThat(matchJobs(3502)).isEqualTo(1);
    }

    // AC-3 · AC-4 — 400 으로 거절한 판정을 다시 걸면 메시지는 같은 작업 · 시도 2 이고 처음 고른 후보 그대로다
    @Test
    void aRejectedJudgmentIsRequeuedWithTheSameCandidates() throws Exception {
        ready(ARTICLE, 0);
        article(3510, "2026-10-05T00:00:00Z");
        embedding(3510, 10);
        link(3510, event(3551, "후보 사건"), "2026-10-05T00:30:00Z");
        long outside = event(3552, "후보 밖 사건");
        long match = queuedMatch(ARTICLE);
        JsonNode first = lastMessage(AnalysisStreams.MATCH_EVENT);

        w1(match, envelope(1, "match-v1", existing(outside))).andExpect(status().isBadRequest());

        JsonNode again = lastMessage(AnalysisStreams.MATCH_EVENT);
        assertThat(again.get("jobId").asLong()).isEqualTo(match);
        assertThat(again.get("attempt").asInt()).isEqualTo(2);
        assertThat(again.get("candidates")).isEqualTo(first.get("candidates"));
        assertThat(again.get("candidates").findValues("eventId").stream().map(JsonNode::asLong))
                .containsExactly(3551L);
    }

    // AC-8 — 모르는 decision 에 U+0000 이 있어도 400 이다. 오류 문구에 받은 글자를 날것으로 붙이면 실패를 적다 DB 에서 터져 500
    @Test
    void unknownDecisionWithNulIsRejectedNotA500() throws Exception {
        ready(ARTICLE, 0);
        long match = queuedMatch(ARTICLE);

        w1(match, envelope(1, "match-v1", "{\"decision\": \"EXI\\u0000STING\", \"eventId\": 1, \"reason\": \"까닭\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESULT_SCHEMA_INVALID"));

        assertThat(count("select attempt from analysis_job where id = " + match))
                .isEqualTo(2);
    }

    // AC-8 — 봉투의 model · promptVersion 에 U+0000 이 있으면 400. 판정 기록(jsonb)이 받지 않아 그대로 두면 500
    @Test
    void envelopeModelWithNulIsRejected() throws Exception {
        ready(ARTICLE, 0);
        long match = queuedMatch(ARTICLE);
        String body = envelope(1, "match-v1", created("착공식")).replace("\"gpt-6-luna\"", "\"gpt\\u0000luna\"");

        w1(match, body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESULT_SCHEMA_INVALID"));

        assertThat(linkedEvent(ARTICLE)).isZero();
        assertThat(count("select attempt from analysis_job where id = " + match))
                .isEqualTo(2);
    }

    // AC-1 — float4 를 넘는 값은 400. double 로는 유한해도 pgvector 칸(float4)에 못 담아 그대로 두면 DB 에서 터진다
    @Test
    void embedWithAValueBeyondFloat4IsRejected() throws Exception {
        long job = job(ARTICLE, "EMBED", "QUEUED", 1);

        w1(job, envelope(1, null, embedEndingWith("3.5e38")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESULT_SCHEMA_INVALID"));

        assertThat(count("select count(*) from article_embedding where article_id = " + ARTICLE))
                .isZero();
    }

    // AC-1 — 아주 작은 값(float4 아래로 내려가는 수)은 받아 저장한다
    @Test
    void embedKeepsTinyValues() throws Exception {
        long job = job(ARTICLE, "EMBED", "QUEUED", 1);

        w1(job, envelope(1, null, embedEndingWith("1e-50"))).andExpect(status().isNoContent());

        assertThat(count("select count(*) from article_embedding where article_id = " + ARTICLE))
                .isEqualTo(1);
    }

    // ── 도우미 ──

    // 1023칸은 0.001 · i, 마지막 칸만 last
    private static String embedEndingWith(String last) {
        String vector = IntStream.range(0, 1023)
                .mapToObj(i -> String.valueOf(0.001 * i))
                .collect(Collectors.joining(",", "[", "," + last + "]"));
        return """
                {"model": "BGE-m3-ko", "dimension": 1024, "vector": %s}""".formatted(vector);
    }

    private static String failed(int attempt, String code) {
        return """
                {"attempt": %d, "status": "FAILED", "model": "gpt-6-luna", "promptVersion": "match-v1",
                 "startedAt": "2026-10-26T09:00:00+09:00", "finishedAt": "2026-10-26T09:00:30+09:00",
                 "result": null, "error": {"code": "%s", "message": "멈춤"}}
                """.formatted(attempt, code);
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

    // 판정할 준비가 된 기사 — 마인드맵(대표 사건 1번 잎, 근거 4개) · 벡터 · EXTRACT · EMBED 성공
    // 0번에 근거 없는 다른 잎을 두어, 번호를 무시하고 첫 잎을 꺼내면 시험이 잡는다
    private void ready(long articleId, double degrees) {
        String evidence = IntStream.range(0, 4)
                .mapToObj(i -> "{\"text\": \"근거 %d-%d\", \"paragraphIndex\": 0, \"sentenceIndex\": %d}"
                        .formatted(articleId, i, i))
                .collect(Collectors.joining(","));
        jdbc.sql("""
                insert into article_mindmap(article_id,summary,content,primary_core_index,occurred_at,schema_version,
                    model,prompt_version,generated_at)
                values (:id,:summary,cast(:content as jsonb),1,'2026-10-05T15:00:00Z','mindmap-v1','gpt-6-luna',
                    'extract-v1',now())
                """)
                .param("id", articleId)
                .param("summary", "요약 " + articleId)
                .param(
                        "content",
                        "{\"title\": null, \"branches\": [{\"type\": \"CORE\", \"items\": [{\"text\": \"다른 잎\", \"evidence\": []}, {\"text\": \"대표 사건 %d\", \"evidence\": [%s]}]}]}"
                                .formatted(articleId, evidence))
                .update();
        embedding(articleId, degrees);
        job(articleId, "EXTRACT", "SUCCEEDED", 1);
        job(articleId, "EMBED", "SUCCEEDED", 1);
    }

    private void embedding(long articleId, double degrees) {
        jdbc.sql(
                        "insert into article_embedding(article_id,model,embedding) values (:id,'BGE-m3-ko',cast(:v as vector))")
                .param("id", articleId)
                .param("v", unitVector(degrees))
                .update();
    }

    private long event(long id, String title) {
        return event(id, title, "2026-10-05T00:00:00Z", "EXTRACTED");
    }

    private long event(long id, String title, String occurredAt, String basis) {
        jdbc.sql("""
                insert into event(id,title,label,summary,occurred_at,occurred_at_basis,created_at,updated_at)
                values (:id,:title,'착공식','사건 요약',cast(:at as timestamptz),:basis,now(),now())
                """)
                .param("id", id)
                .param("title", title)
                .param("at", occurredAt)
                .param("basis", basis)
                .update();
        return id;
    }

    private void link(long articleId, long eventId, String linkedAt) {
        jdbc.sql("insert into article_event(article_id,event_id,linked_at) values (:a,:e,cast(:at as timestamptz))")
                .param("a", articleId)
                .param("e", eventId)
                .param("at", linkedAt)
                .update();
    }

    private long job(long articleId, String stage, String status, int attempt) {
        return jdbc.sql("""
                insert into analysis_job(article_id,stage,status,requested_by,attempt,created_at,queued_at,published_at)
                values (:article,:stage,:status,'BATCH',:attempt,now(),now(),now())
                returning id
                """)
                .param("article", articleId)
                .param("stage", stage)
                .param("status", status)
                .param("attempt", attempt)
                .query(Long.class)
                .single();
    }

    private void setMatch(long articleId, String status, String retryAt) {
        jdbc.sql("update analysis_job set status = :status, retry_at = " + retryAt
                        + " where article_id = :id and stage = 'MATCH_EVENT'")
                .param("status", status)
                .param("id", articleId)
                .update();
    }

    private int matchJobs(long articleId) {
        return (int) count(
                "select count(*) from analysis_job where article_id = " + articleId + " and stage = 'MATCH_EVENT'");
    }

    private String matchStatus(long articleId) {
        return jdbc.sql("select status from analysis_job where article_id = :id and stage = 'MATCH_EVENT'")
                .param("id", articleId)
                .query(String.class)
                .single();
    }

    private long count(String sql) {
        return jdbc.sql(sql).query(Long.class).single();
    }

    // 판정할 준비가 된 기사에 판정을 걸고 그 작업 ID
    private long queuedMatch(long articleId) {
        service.dispatchMatch();
        return matchJobId(articleId);
    }

    private long matchJobId(long articleId) {
        return count("select id from analysis_job where article_id = " + articleId + " and stage = 'MATCH_EVENT'");
    }

    // 기사가 붙은 사건. 안 붙었으면 0 — 「결과 없음」 예외가 아니라 단언에서 갈리게
    private long linkedEvent(long articleId) {
        return count("select coalesce(max(event_id), 0) from article_event where article_id = " + articleId);
    }

    private Instant occurredAt(long eventId) {
        return jdbc.sql("select occurred_at from event where id = :id")
                .param("id", eventId)
                .query(OffsetDateTime.class)
                .single()
                .toInstant();
    }

    private String eventColumn(long eventId, String column) {
        return jdbc.sql("select " + column + " from event where id = :id")
                .param("id", eventId)
                .query(String.class)
                .single();
    }

    // 판정 기록 analysis_job.result — { reason, model, promptVersion }
    private JsonNode matchRecord(long articleId) {
        return jsonMapper.readTree(
                jdbc.sql("select result::text from analysis_job where article_id = :id and stage = 'MATCH_EVENT'")
                        .param("id", articleId)
                        .query(String.class)
                        .single());
    }

    private static String existing(long eventId) {
        return """
                {"decision": "EXISTING", "eventId": %d, "newEvent": null, "reason": "같은 착공식이다"}""".formatted(eventId);
    }

    private static String created(String label) {
        return createdWith(label, "\"role\": \"MAIN\", \"reactsTo\": null");
    }

    // roleFields 는 newEvent 안 summary 뒤에 그대로 붙는 JSON 조각이다. 비우면 역할 칸이 없는 newEvent 가 된다
    private static String createdWith(String label, String roleFields) {
        return """
                {"decision": "NEW", "eventId": null, "reason": "후보와 다른 사건이다",
                 "newEvent": {"title": "한빛반도체 텍사스 공장 착공식", "label": "%s", "summary": "한빛반도체가 착공식을 열었다."%s}}""".formatted(label, roleFields.isEmpty() ? "" : ", " + roleFields);
    }

    private ResultActions w1(long jobId, String body) throws Exception {
        return mvc.perform(post("/internal/v1/analysis-jobs/{jobId}/result", jobId)
                .header("X-Internal-Key", WORKER_KEY)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    // 임베딩은 프롬프트가 없어 promptVersion 이 null 이다 (api-internal.md 5절 봉투)
    private static String envelope(int attempt, String promptVersion, String result) {
        return """
                {"attempt": %d, "status": "SUCCEEDED", "model": "gpt-6-luna", "promptVersion": %s,
                 "startedAt": "2026-10-26T09:00:00+09:00", "finishedAt": "2026-10-26T09:00:30+09:00",
                 "result": %s, "error": null}
                """.formatted(attempt, promptVersion == null ? "null" : "\"" + promptVersion + "\"", result);
    }

    // 값은 0.001 · i — i 번째 칸(0부터)이 0.001 · i
    private static String embedResult(String model, int dimension) {
        String vector = IntStream.range(0, dimension)
                .mapToObj(i -> String.valueOf(0.001 * i))
                .collect(Collectors.joining(",", "[", "]"));
        return """
                {"model": "%s", "dimension": %d, "vector": %s}""".formatted(model, dimension, vector);
    }

    private static String embedAt(double degrees) {
        return """
                {"model": "BGE-m3-ko", "dimension": 1024, "vector": %s}""".formatted(unitVector(degrees));
    }

    private static String extractResult(int primaryCoreIndex) {
        return """
                {"summary": "요약", "schemaVersion": "mindmap-v1",
                 "mindmap": {"branches": [{"type": "CORE", "items": [{"text": "착공식을 열었다"}]}]},
                 "primaryCoreIndex": %d, "occurredAt": null}""".formatted(primaryCoreIndex);
    }

    // 앞 두 칸만 쓰는 단위 벡터 [cos θ, sin θ, 0, …] — 두 벡터의 코사인 유사도가 cos(각도 차)가 된다
    private static String unitVector(double degrees) {
        double radians = Math.toRadians(degrees);
        return IntStream.range(0, 1024)
                .mapToObj(i ->
                        i == 0 ? String.valueOf(Math.cos(radians)) : i == 1 ? String.valueOf(Math.sin(radians)) : "0")
                .collect(Collectors.joining(",", "[", "]"));
    }

    private String embeddingModel(long articleId) {
        return jdbc.sql("select model from article_embedding where article_id = :id")
                .param("id", articleId)
                .query(String.class)
                .single();
    }

    private JsonNode lastMessage(String stream) {
        List<MapRecord<String, Object, Object>> last = redis.opsForStream()
                .reverseRange(stream, Range.unbounded(), Limit.limit().count(1));
        assertThat(last).hasSize(1);
        return jsonMapper.readTree((String) last.getFirst().getValue().get("payload"));
    }
}
