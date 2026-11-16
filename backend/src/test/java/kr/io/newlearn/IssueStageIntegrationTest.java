package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.stream.LongStream;
import java.util.stream.StreamSupport;
import kr.io.newlearn.analysis.AnalysisJobRecovery;
import kr.io.newlearn.analysis.AnalysisJobService;
import kr.io.newlearn.analysis.queue.AnalysisStreams;
import org.assertj.core.data.Offset;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
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
import org.springframework.test.context.NestedTestConfiguration;
import org.springframework.test.context.NestedTestConfiguration.EnclosingConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// ISSUE 단계 — 한 번에 하나씩 고르기 · 후보 · W1 ATTACH · CREATE · NONE · 409 (Jira 40, docs/specs/F07-issue-assign.md)
// 진짜 처리기와 실제 PostgreSQL(pgvector) · Redis 로 본다. W1 은 커밋까지 가야 결과가 보여서 @Transactional 을 붙이지 않고,
// 만든 행은 끝날 때 지운다. 시험 설정은 1분 스케줄러를 꺼 두었다 — ISSUE 고르기는 W1 뒤와 dispatchIssue() 로 부른다.
// 기사 · 사건 · 이슈 번호는 4001 ~ 4099 를 쓰고, 사건은 같은 번호의 기사가 만든 것으로 둔다
@SpringBootTest
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
@Import(TestcontainersConfiguration.class)
@TestPropertySource(
        properties = {
            "newlearn.internal.worker-key=" + IssueStageIntegrationTest.WORKER_KEY,
            "newlearn.internal.batch-key=batch-key-for-issue-stage-test"
        })
class IssueStageIntegrationTest {

    static final String WORKER_KEY = "worker-key-for-issue-stage-test";
    static final String PRESS = "issue40";

    // 이번 사건(과 그 사건을 만든 기사) — 다른 사건보다 번호가 커서 「먼저 생긴 사건」 시험에 쓴다
    static final long OWN = 4050;

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

    @BeforeEach
    void fixtures() {
        jdbc.sql("insert into press values (:code, '이슈시험신문')")
                .param("code", PRESS)
                .update();
    }

    @AfterEach
    void cleanUp() {
        // 판정 · ISSUE 가 만든 사건 · 이슈는 DB 가 번호를 매겨 4001 ~ 4099 밖일 수 있다 — 지우기 전에 번호를 모아 둔다
        List<Long> events = jdbc.sql(
                        "select distinct event_id from article_event where article_id between 4001 and 4099")
                .query(Long.class)
                .list();
        List<Long> issues = jdbc.sql("""
                select distinct issue_id from event
                where issue_id is not null
                  and (id between 4001 and 4099
                       or id in (select event_id from article_event where article_id between 4001 and 4099))
                """).query(Long.class).list();
        // 외래 키에 on delete 가 없어 이슈 · 기사 · 사건보다 먼저 지운다
        jdbc.sql("delete from issue_category where issue_id between 4001 and 4099")
                .update();
        jdbc.sql("delete from article_event where article_id between 4001 and 4099")
                .update();
        jdbc.sql("delete from event where id between 4001 and 4099").update();
        if (!events.isEmpty()) {
            jdbc.sql("delete from event where id in (:ids)")
                    .param("ids", events)
                    .update();
        }
        if (!issues.isEmpty()) {
            jdbc.sql("delete from issue_category where issue_id in (:ids)")
                    .param("ids", issues)
                    .update();
            jdbc.sql("delete from issue where id in (:ids)")
                    .param("ids", issues)
                    .update();
        }
        jdbc.sql("delete from issue where id between 4001 and 4099").update();
        jdbc.sql("delete from article_embedding where article_id between 4001 and 4099")
                .update();
        jdbc.sql("delete from article_mindmap where article_id between 4001 and 4099")
                .update();
        jdbc.sql("delete from analysis_job where article_id between 4001 and 4099")
                .update();
        jdbc.sql("delete from article where id between 4001 and 4099").update();
        jdbc.sql("delete from press where code = :code").param("code", PRESS).update();
    }

    // ── 고르기 ──

    // AC-1 — 판정이 새 사건을 만든 W1 뒤에 그 사건의 ISSUE 가 바로 큐에 들어간다
    @Test
    void theIssueIsQueuedRightAfterTheJudgmentCreatesTheEvent() throws Exception {
        readyForMatch(4001);
        service.dispatchMatch();

        w1(jobId(4001, "MATCH_EVENT"), envelope(1, "match-v1", newEvent())).andExpect(status().isNoContent());

        long issueJob = jobId(4001, "ISSUE");
        assertThat(jobState(issueJob)).isEqualTo("QUEUED 후보 있음 넣음");
        JsonNode message = lastMessage();
        assertThat(message.get("jobId").asLong()).isEqualTo(issueJob);
        assertThat(message.get("event").get("id").asLong()).isEqualTo(linkedEvent(4001));
    }

    // AC-1 · AC-2 — 한 번에 하나, 작업 번호 순서. 앞 ISSUE 결과를 저장한 W1 뒤에 다음 대기 작업이 걸린다
    @Test
    void issuesRunOneAtATimeInJobOrder() throws Exception {
        event(4011, 0, null);
        event(4012, 10, null);
        long first = waitingIssue(4012); // 사건 번호는 크지만 작업이 먼저 생겼다
        long second = waitingIssue(4011);

        service.dispatchIssue();
        assertThat(jobState(first)).isEqualTo("QUEUED 후보 있음 넣음");
        assertThat(jobState(second)).isEqualTo("QUEUED 후보 없음 안 넣음");

        service.dispatchIssue();
        assertThat(jobState(second)).as("앞 ISSUE 가 진행 중이면 기다린다").isEqualTo("QUEUED 후보 없음 안 넣음");

        w1(first, envelope(1, "issue-v1", none())).andExpect(status().isNoContent());

        assertThat(jobState(first)).isEqualTo("SUCCEEDED 후보 있음 넣음");
        assertThat(jobState(second)).isEqualTo("QUEUED 후보 있음 넣음");
    }

    // AC-1 — 다시 걸 예정인 실패도 진행 중이다. 멈춘 실패(retry_at 이 빔)는 다음 대기 작업을 막지 않는다
    @Test
    void aRetryingIssueWaitsAndAStoppedOneLetsTheNextGo() throws Exception {
        event(4011, 0, null);
        event(4012, 10, null);
        long first = waitingIssue(4011);
        long second = waitingIssue(4012);
        service.dispatchIssue();

        w1(first, failed(1, "LLM_TIMEOUT")).andExpect(status().isNoContent());
        assertThat(jobState(second)).as("1분 뒤 다시 걸 실패는 진행 중").isEqualTo("QUEUED 후보 없음 안 넣음");

        jdbc.sql("update analysis_job set retry_at = null where id = :id")
                .param("id", first)
                .update();
        service.dispatchIssue();

        assertThat(jobState(second)).isEqualTo("QUEUED 후보 있음 넣음");
    }

    // AC-1 · AC-3 — 늦춰 다시 걸 때가 되면 대기 작업으로 돌아가 고르기가 다시 고른다. 후보는 그때 새로 계산한다
    @Test
    void aLaterRetryIsPickedAgainWithFreshCandidates() throws Exception {
        event(OWN, 0, null);
        long job = waitingIssue(OWN);
        service.dispatchIssue();
        assertThat(candidates(job).get("issues")).isEmpty();
        w1(job, failed(1, "LLM_TIMEOUT")).andExpect(status().isNoContent());

        issue(4001, "북항 상어 출몰", "이슈 요약");
        event(4001, 10, null);
        inIssue(4001, 4001);
        recovery.retryDue(Instant.now().plusSeconds(61));
        assertThat(jobState(job)).isEqualTo("QUEUED 후보 없음 안 넣음");
        service.dispatchIssue();

        assertThat(jobState(job)).isEqualTo("QUEUED 후보 있음 넣음");
        assertThat(ids(candidates(job).get("issues"), "issueId")).containsExactly(4001L);
        JsonNode message = lastMessage();
        assertThat(message.get("attempt").asInt()).isEqualTo(2);
        assertThat(ids(message.get("candidateIssues"), "issueId")).containsExactly(4001L);
    }

    // AC-1 — 같은 ISSUE 가 W1 없이 40분 넘게 QUEUED 면 ISSUE 줄이 멈춘 것일 수 있다 — WARN. 40분 안이면 「기다림」만
    @Test
    void anIssueStuckInQueuedIsWarned(CapturedOutput output) {
        event(4011, 0, null);
        event(4012, 10, null);
        long first = waitingIssue(4011);
        waitingIssue(4012);
        service.dispatchIssue();

        jdbc.sql("update analysis_job set queued_at = now() - interval '39 minutes' where id = :id")
                .param("id", first)
                .update();
        service.dispatchIssue();
        assertThat(output.toString())
                .contains("ISSUE 고르기 기다림: ISSUE 작업 " + first)
                .doesNotContain("ISSUE 줄이 멈췄을 수 있다");

        jdbc.sql("update analysis_job set queued_at = now() - interval '41 minutes' where id = :id")
                .param("id", first)
                .update();
        service.dispatchIssue();

        assertThat(output.toString()).contains("ISSUE 줄이 멈췄을 수 있다: ISSUE 작업 " + first);
    }

    // AC-1 · AC-2 — 오래 기다린 대기 작업도 고른 때부터 잰다. 방금 고른 작업에 멈춤 WARN 이 나지 않고, 큐에 넣었다는 표시를
    // 적기 전에 못 넣은 작업 넣기가 돌아도(1분 기다림) 같은 메시지를 다시 넣지 않는다
    @Test
    void aLongWaitingIssueStartsItsClockWhenPicked(CapturedOutput output) {
        event(4011, 0, null);
        event(4012, 10, null);
        long first = waitingIssue(4011);
        waitingIssue(4012);
        jdbc.sql("update analysis_job set queued_at = now() - interval '2 hours' where article_id in (4011, 4012)")
                .update();

        service.dispatchIssue();
        service.dispatchIssue();
        assertThat(output.toString())
                .contains("ISSUE 고르기 기다림: ISSUE 작업 " + first)
                .doesNotContain("ISSUE 줄이 멈췄을 수 있다");

        jdbc.sql("update analysis_job set published_at = null where id = :id")
                .param("id", first)
                .update();
        recovery.publishUnpublished(Instant.now());
        assertThat(jobState(first)).isEqualTo("QUEUED 후보 있음 안 넣음");
    }

    // AC-2 — 1분 스케줄러의 「못 넣은 작업 넣기」는 대기 작업(후보가 빔)을 넣지 않는다. 고른 뒤 못 넣은 작업은 같은 후보로 넣는다
    @Test
    void waitingIssuesAreLeftToTheDispatcherButAPickedOneIsRepublished() {
        event(4011, 5, null);
        event(OWN, 0, null);
        long job = waitingIssue(OWN);
        jdbc.sql("update analysis_job set queued_at = now() - interval '2 minutes' where id = :id")
                .param("id", job)
                .update();

        recovery.publishUnpublished(Instant.now());
        assertThat(jobState(job)).isEqualTo("QUEUED 후보 없음 안 넣음");

        service.dispatchIssue();
        String picked = candidatesText(job);
        jdbc.sql("update analysis_job set published_at = null, queued_at = now() - interval '2 minutes' where id = :id")
                .param("id", job)
                .update();
        recovery.publishUnpublished(Instant.now());

        assertThat(jobState(job)).isEqualTo("QUEUED 후보 있음 넣음");
        assertThat(candidatesText(job)).isEqualTo(picked);
        JsonNode message = lastMessage();
        assertThat(message.get("jobId").asLong()).isEqualTo(job);
        assertThat(message.get("attempt").asInt()).isEqualTo(1);
        assertThat(ids(message.get("candidateEvents"), "eventId")).containsExactly(4011L);
    }

    // AC-2 — 고른 작업의 사건이 이미 이슈 안이면(사람이 고친 경우) 묻지 않고 끝내고 다음 대기 작업을 고른다
    @Test
    void anEventAlreadyInAnIssueIsFinishedWithoutAsking() {
        issue(4001, "북항 상어 출몰", "이슈 요약");
        event(4011, 0, null);
        event(4012, 10, null);
        inIssue(4011, 4001);
        long first = waitingIssue(4011);
        long second = waitingIssue(4012);

        service.dispatchIssue();

        assertThat(jobState(first)).isEqualTo("SUCCEEDED 후보 없음 안 넣음");
        assertThat(jobState(second)).isEqualTo("QUEUED 후보 있음 넣음");
        assertThat(lastMessage().get("jobId").asLong()).isEqualTo(second);
    }

    // ── 후보 · 메시지 ──

    // AC-3 — 후보 이슈는 가까운 5개, 후보 사건은 이슈 밖이고 이번 사건보다 먼저 생긴 가까운 10개.
    // 나중에 생긴 사건은 아무리 가까워도 빠진다. similarity 는 1 − 코사인 거리
    @Test
    void candidatesAreTheNearestIssuesAndEarlierEventsOutsideIssues() {
        event(OWN, 0, null);
        for (long id = 4001; id <= 4006; id++) {
            issue(id, "이슈 " + id, "요약");
            event(id, 10.0 * (id - 4000), null); // 10° ~ 60°
            inIssue(id, id);
        }
        for (long id = 4011; id <= 4021; id++) {
            event(id, (double) (id - 4010), null); // 1° ~ 11°
        }
        event(4060, 0.5, null); // 가장 가깝지만 나중에 생긴 사건
        long job = waitingIssue(OWN);

        service.dispatchIssue();

        JsonNode picked = candidates(job);
        assertThat(ids(picked.get("issues"), "issueId")).containsExactly(4001L, 4002L, 4003L, 4004L, 4005L);
        assertThat(ids(picked.get("events"), "eventId"))
                .containsExactlyElementsOf(
                        LongStream.rangeClosed(4011, 4020).boxed().toList());
        assertThat(picked.get("issues").get(0).get("similarity").asDouble())
                .isCloseTo(Math.cos(Math.toRadians(10)), Offset.offset(1e-6));
        assertThat(picked.get("events").get(0).get("similarity").asDouble())
                .isCloseTo(Math.cos(Math.toRadians(1)), Offset.offset(1e-6));
    }

    // 2026-11-14 측정: 이슈에 붙은 사건 34건이 그 흐름이 아니었고, 그중 넷은 이슈와의 유사도가 0.60 아래였다.
    // 기본값(2.0)은 코사인 거리의 최댓값이라 아무것도 걸러내지 않는다 — 지금과 같은 후보가 나와야 한다
    @Test
    void aFarIssueIsStillOfferedWhenTheCapIsOff() {
        event(OWN, 0, null);
        issue(4001, "가까운 이슈", "요약");
        event(4001, 10, null);
        inIssue(4001, 4001);
        issue(4002, "먼 이슈", "요약");
        event(4002, 60, null); // 유사도 0.5 = 거리 0.5
        inIssue(4002, 4002);
        long job = waitingIssue(OWN);

        service.dispatchIssue();

        assertThat(ids(candidates(job).get("issues"), "issueId")).containsExactly(4001L, 4002L);
    }

    // AC-3 — 거리는 이번 사건이 생길 때까지 묶인 기사로만 잰다. 판정 줄이 앞서 나가 나중에 붙인 기사는 아무리 가까워도 빼서,
    // 판정이 얼마나 앞섰든 같은 후보가 나온다
    @Test
    void candidatesUseOnlyTheArticlesLinkedByThen() {
        event(4011, 80, null);
        event(OWN, 0, null);
        article(4012, null);
        embedding(4012, 1);
        link(4012, 4011, 70); // 이번 사건(50분)보다 뒤에 묶임
        long job = waitingIssue(OWN);

        service.dispatchIssue();

        JsonNode picked = candidates(job).get("events");
        assertThat(ids(picked, "eventId")).containsExactly(4011L);
        assertThat(picked.get(0).get("similarity").asDouble())
                .isCloseTo(Math.cos(Math.toRadians(80)), Offset.offset(1e-6));
    }

    // AC-4 — 메시지 모양이 계약 4절과 같다. 이슈마다 최근 사건 5개를 발생 시점 순서로(오래된 것부터)
    @Test
    void messageCarriesTheEventAndTheRecentEventsOfEachIssue() {
        issue(4001, "북항 상어 출몰", "이슈 요약");
        for (long id = 4001; id <= 4007; id++) {
            event(id, 10, null, "2026-10-0" + (id - 4000) + "T00:00:00Z"); // 10월 1일 ~ 7일
            inIssue(id, 4001);
        }
        event(4011, 5, null, "2026-10-06T03:00:00Z");
        event(OWN, 0, null, "2026-10-08T00:00:00Z");
        long job = waitingIssue(OWN);

        service.dispatchIssue();

        JsonNode message = lastMessage();
        assertThat(names(message))
                .containsExactlyInAnyOrder(
                        "articleId", "jobId", "attempt", "event", "candidateIssues", "candidateEvents");
        assertThat(message.get("articleId").asLong()).isEqualTo(OWN);
        assertThat(message.get("jobId").asLong()).isEqualTo(job);
        assertThat(message.get("attempt").asInt()).isEqualTo(1);

        JsonNode event = message.get("event");
        assertThat(names(event)).containsExactlyInAnyOrder("id", "title", "label", "summary", "occurredAt");
        assertThat(event.get("id").asLong()).isEqualTo(OWN);
        assertThat(event.get("title").asString()).isEqualTo("사건 " + OWN);
        assertThat(event.get("label").asString()).isEqualTo("키워드 " + OWN);
        assertThat(event.get("summary").asString()).isEqualTo("요약 " + OWN);
        assertThat(event.get("occurredAt").asString()).isEqualTo("2026-10-08T09:00:00+09:00");

        JsonNode issue = message.get("candidateIssues").get(0);
        assertThat(names(issue)).containsExactlyInAnyOrder("issueId", "title", "summary", "events");
        assertThat(issue.get("issueId").asLong()).isEqualTo(4001);
        assertThat(issue.get("title").asString()).isEqualTo("북항 상어 출몰");
        assertThat(issue.get("summary").asString()).isEqualTo("이슈 요약");
        assertThat(names(issue.get("events").get(0))).containsExactlyInAnyOrder("title", "label", "occurredAt");
        assertThat(StreamSupport.stream(issue.get("events").spliterator(), false)
                        .map(e -> e.get("title").asString())
                        .toList())
                .containsExactly("사건 4003", "사건 4004", "사건 4005", "사건 4006", "사건 4007");
        assertThat(issue.get("events").get(0).get("occurredAt").asString()).isEqualTo("2026-10-03T09:00:00+09:00");

        JsonNode outside = message.get("candidateEvents").get(0);
        assertThat(names(outside))
                .containsExactlyInAnyOrder("eventId", "title", "label", "summary", "occurredAt", "similarity");
        assertThat(outside.get("eventId").asLong()).isEqualTo(4011);
        assertThat(outside.get("occurredAt").asString()).isEqualTo("2026-10-06T12:00:00+09:00");
        assertThat(outside.get("similarity").asDouble()).isCloseTo(Math.cos(Math.toRadians(5)), Offset.offset(1e-6));
    }

    // ── 결과 저장 ──

    // AC-5 — ATTACH 면 사건이 그 이슈에 들어가고 요약은 덮어쓰고 이름은 그대로. 판정 기록이 남는다
    @Test
    void attachPutsTheEventInAndRewritesTheSummary() throws Exception {
        issue(4001, "북항 상어 출몰", "옛 요약");
        event(4001, 10, null);
        inIssue(4001, 4001);
        event(OWN, 0, null);
        long job = dispatched(OWN);

        w1(job, envelope(1, "issue-v1", attach(4001, "새 요약"))).andExpect(status().isNoContent());

        assertThat(issueOf(OWN)).isEqualTo(4001);
        assertThat(issueColumn(4001, "title")).isEqualTo("북항 상어 출몰");
        assertThat(issueColumn(4001, "summary")).isEqualTo("새 요약");
        assertThat(jobState(job)).startsWith("SUCCEEDED");
        JsonNode record = record(job);
        assertThat(record.get("reason").asString()).isEqualTo("같은 흐름이다");
        assertThat(record.get("model").asString()).isEqualTo("gpt-6-luna");
        assertThat(record.get("promptVersion").asString()).isEqualTo("issue-v1");
    }

    // AC-6 — CREATE 면 받은 이름 · 요약으로 새 이슈를 만들고, 이번 사건을 포함한 사건 3개가 그 이슈에 들어간다
    @Test
    void createMakesAnIssueWithTheChosenEvents() throws Exception {
        event(4011, 5, null);
        event(4012, 8, null);
        event(OWN, 0, null);
        long job = dispatched(OWN);

        w1(job, envelope(1, "issue-v1", create("북항 상어 출몰", "상어가 나타나 해경이 나섰다.", OWN, 4011, 4012)))
                .andExpect(status().isNoContent());

        long created = issueOf(OWN);
        assertThat(created).as("새 이슈에 들어갔다").isNotZero();
        assertThat(issueOf(4011)).isEqualTo(created);
        assertThat(issueOf(4012)).isEqualTo(created);
        assertThat(issueColumn(created, "title")).isEqualTo("북항 상어 출몰");
        assertThat(issueColumn(created, "summary")).isEqualTo("상어가 나타나 해경이 나섰다.");
        assertThat(jobState(job)).startsWith("SUCCEEDED");
    }

    // 메인 흐름 가드(Jira 224)는 기본으로 꺼져 있다 — 서브 흐름 사건만이어도 지금처럼 만든다
    @Test
    void createWithoutAMainEventStillMakesTheIssueWhenTheGuardIsOff() throws Exception {
        event(4011, 5, null, "2026-10-05T00:00:00Z", "REACTION");
        event(4012, 8, null, "2026-10-05T00:00:00Z", "REACTION");
        event(OWN, 0, null, "2026-10-05T00:00:00Z", "REACTION");
        long job = dispatched(OWN);

        w1(job, envelope(1, "issue-v1", create("서브만 이슈", "반응만 이어졌다.", OWN, 4011, 4012)))
                .andExpect(status().isNoContent());

        assertThat(issueOf(OWN)).as("가드를 끄면 만든다").isNotZero();
        assertThat(jobState(job)).startsWith("SUCCEEDED");
    }

    // AC-7 — NONE 이면 사건은 이슈 밖에 그대로이고 판정 기록만 남는다
    @Test
    void noneLeavesTheEventOutside() throws Exception {
        event(4011, 5, null);
        event(OWN, 0, null);
        long job = dispatched(OWN);

        w1(job, envelope(1, "issue-v1", none())).andExpect(status().isNoContent());

        assertThat(issueOf(OWN)).isZero();
        assertThat(issueOf(4011)).isZero();
        assertThat(record(job).get("reason").asString()).isEqualTo("아직 이슈로 묶을 사건이 없다");
    }

    // AC-8 — 거절하면 아무것도 바꾸지 않고, 후보를 새로 계산해 한 번 다시 묻는다
    @Test
    void aRejectedResultChangesNothingAndIsAskedAgainWithFreshCandidates() throws Exception {
        event(4011, 5, null);
        event(OWN, 0, null);
        long job = dispatched(OWN);
        issue(4001, "북항 상어 출몰", "이슈 요약");
        event(4001, 3, null);
        inIssue(4001, 4001);

        w1(job, envelope(1, "issue-v1", create("둘뿐인 이슈", "요약", OWN, 4011)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESULT_SCHEMA_INVALID"));

        assertThat(issueOf(OWN)).isZero();
        assertThat(issueOf(4011)).isZero();
        assertThat(jobState(job)).isEqualTo("QUEUED 후보 있음 넣음");
        JsonNode message = lastMessage();
        assertThat(message.get("attempt").asInt()).isEqualTo(2);
        assertThat(ids(message.get("candidateIssues"), "issueId")).containsExactly(4001L);
    }

    // AC-8 — 보낸 후보 밖 이슈 · 사건, 이번 사건이 없는 새 이슈는 400 이고 아무것도 바꾸지 않는다
    @ParameterizedTest
    @ValueSource(
            strings = {
                // 고른 뒤에 생겨 후보가 아닌 이슈
                "{\"decision\": \"ATTACH\", \"issueId\": 4002, \"issueSummary\": \"요약\", \"reason\": \"까닭\"}",
                // 이번 사건만 없다 — 셋 다 보낸 후보 사건이다
                "{\"decision\": \"CREATE\", \"eventIds\": [4011, 4012, 4013], \"issueTitle\": \"이름\", \"issueSummary\": \"요약\", \"reason\": \"까닭\"}",
                // 나중에 생겨 후보가 아닌 사건
                "{\"decision\": \"CREATE\", \"eventIds\": [4050, 4011, 4060], \"issueTitle\": \"이름\", \"issueSummary\": \"요약\", \"reason\": \"까닭\"}"
            })
    void resultsOutsideTheCandidatesAreRejected(String result) throws Exception {
        issue(4001, "북항 상어 출몰", "이슈 요약");
        event(4001, 10, null);
        inIssue(4001, 4001);
        event(4011, 5, null);
        event(4012, 8, null);
        event(4013, 9, null);
        event(OWN, 0, null);
        event(4060, 1, null);
        long job = dispatched(OWN);
        assertThat(ids(candidates(job).get("events"), "eventId")).containsExactly(4011L, 4012L, 4013L);
        issue(4002, "다른 이슈", "요약");
        event(4002, 2, null);
        inIssue(4002, 4002);

        w1(job, envelope(1, "issue-v1", result))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESULT_SCHEMA_INVALID"));

        assertThat(issueOf(OWN)).isZero();
        assertThat(issueOf(4011)).isZero();
        assertThat(issueOf(4013)).isZero();
        assertThat(issueOf(4060)).isZero();
        assertThat(issueColumn(4002, "summary")).isEqualTo("요약");
    }

    // AC-8 — 봉투의 model · promptVersion 에 U+0000 이 있으면 400. 판정 기록(jsonb)이 받지 않아 그대로 두면 500
    @Test
    void envelopeModelWithNulIsRejected() throws Exception {
        event(OWN, 0, null);
        long job = dispatched(OWN);

        w1(job, """
                        {"attempt": 1, "status": "SUCCEEDED", "model": "gpt\\u0000luna", "promptVersion": "issue-v1",
                         "startedAt": "2026-10-29T09:00:00+09:00", "finishedAt": "2026-10-29T09:00:30+09:00",
                         "result": %s, "error": null}
                        """.formatted(none()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESULT_SCHEMA_INVALID"));
    }

    // AC-7 — 봉투의 model · promptVersion 이 없어도 받고, 판정 기록에 null 로 남긴다
    @Test
    void aMissingModelIsKeptAsNull() throws Exception {
        event(OWN, 0, null);
        long job = dispatched(OWN);

        w1(job, """
                        {"attempt": 1, "status": "SUCCEEDED",
                         "startedAt": "2026-10-29T09:00:00+09:00", "finishedAt": "2026-10-29T09:00:30+09:00",
                         "result": %s, "error": null}
                        """.formatted(none())).andExpect(status().isNoContent());

        assertThat(record(job).get("model").isNull()).isTrue();
        assertThat(record(job).get("promptVersion").isNull()).isTrue();
    }

    // AC-9 — 그사이 다른 이슈에 들어간 사건이 있으면 409. 아무것도 바꾸지 않고 JOB_STATE_CONFLICT 로 적은 뒤 후보를 새로 계산해 다시 묻는다
    @Test
    void anEventTakenMeanwhileIsAConflictAndAskedAgain() throws Exception {
        event(4011, 5, null);
        event(4012, 8, null);
        event(OWN, 0, null);
        long job = dispatched(OWN);
        issue(4001, "사람이 만든 이슈", "요약");
        inIssue(4011, 4001);

        w1(job, envelope(1, "issue-v1", create("북항 상어 출몰", "요약", OWN, 4011, 4012)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("JOB_STATE_CONFLICT"));

        assertThat(issueOf(OWN)).isZero();
        assertThat(issueOf(4012)).isZero();
        assertThat(issueOf(4011)).isEqualTo(4001);
        assertThat(count("select count(*) from issue where title = '북항 상어 출몰'")).isZero();
        assertThat(jobState(job)).isEqualTo("QUEUED 후보 있음 넣음");
        assertThat(jdbc.sql("select attempt || ' ' || error_code from analysis_job where id = :id")
                        .param("id", job)
                        .query(String.class)
                        .single())
                .isEqualTo("2 JOB_STATE_CONFLICT");
        JsonNode picked = candidates(job);
        assertThat(ids(picked.get("issues"), "issueId")).containsExactly(4001L);
        assertThat(ids(picked.get("events"), "eventId")).containsExactly(4012L);
    }

    // AC-9 — 고른 이슈가 그사이 없어졌으면 409 이고 다시 묻는다
    @Test
    void aVanishedIssueIsAConflict() throws Exception {
        issue(4001, "북항 상어 출몰", "이슈 요약");
        event(4001, 10, null);
        inIssue(4001, 4001);
        event(OWN, 0, null);
        long job = dispatched(OWN);
        jdbc.sql("update event set issue_id = null where id = 4001").update();
        jdbc.sql("delete from issue where id = 4001").update();

        w1(job, envelope(1, "issue-v1", attach(4001, "새 요약")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("JOB_STATE_CONFLICT"));

        assertThat(issueOf(OWN)).isZero();
        assertThat(lastMessage().get("attempt").asInt()).isEqualTo(2);
    }

    // AC-10 — 카테고리는 이슈 기사들의 대표 카테고리 중 가장 많은 것 하나. 사건을 붙이면 다시 계산한다
    @Test
    void theCategoryIsTheMostCommonOneAndRecomputedOnAttach() throws Exception {
        event(4011, 5, "economy");
        event(4012, 8, "economy");
        article(4013, null); // 대표 카테고리가 없는 기사는 셈에서 뺀다
        link(4013, 4011);
        event(OWN, 0, "politics");
        long job = dispatched(OWN);
        w1(job, envelope(1, "issue-v1", create("북항 상어 출몰", "요약", OWN, 4011, 4012)))
                .andExpect(status().isNoContent());
        long created = issueOf(OWN);
        assertThat(categories(created)).containsExactly("economy");

        event(4060, 2, "politics");
        for (long extra = 4061; extra <= 4062; extra++) {
            article(extra, "politics");
            link(extra, 4060);
        }
        long next = dispatched(4060);
        w1(next, envelope(1, "issue-v1", attach(created, "새 요약"))).andExpect(status().isNoContent());

        assertThat(categories(created)).as("정치 4 · 경제 2").containsExactly("politics");
    }

    // AC-10 — 기사 수가 같으면 카테고리 순서(sort_order)가 앞선 것. 이름순이면 economy 가 앞선다
    @Test
    void aTiedCategoryGoesBySortOrder() throws Exception {
        event(4011, 5, "economy");
        event(4012, 8, "politics");
        event(OWN, 0, null);
        long job = dispatched(OWN);

        w1(job, envelope(1, "issue-v1", create("북항 상어 출몰", "요약", OWN, 4011, 4012)))
                .andExpect(status().isNoContent());

        assertThat(categories(issueOf(OWN))).containsExactly("politics");
    }

    // ── 붙이기만 하고 요약 · 분야는 그대로 (Jira S15P31A102-207) ──

    // 설정을 끄면 ATTACH 가 사건만 이슈에 넣는다. 발표(11-18)까지 운영이 이 설정으로 돈다 —
    // 거리 상한을 켜면 먼 이슈는 후보로 올리지 않는다 — IssueResultHandler 가 후보 밖 issueId 를 거부하므로
    // 이 상한이 「분야만 겹치는 이슈에 붙는 길」을 막는 하드 가드가 된다
    @Nested
    @NestedTestConfiguration(EnclosingConfiguration.OVERRIDE)
    @SpringBootTest
    @AutoConfigureMockMvc
    @Import(TestcontainersConfiguration.class)
    @TestPropertySource(
            properties = {
                "newlearn.internal.worker-key=" + IssueStageIntegrationTest.WORKER_KEY,
                "newlearn.internal.batch-key=batch-key-for-issue-stage-test",
                "newlearn.analysis.issue.max-candidate-distance=0.40"
            })
    class CandidateDistanceCap {

        @Test
        void aFarIssueIsNotOfferedAsCandidate() {
            event(OWN, 0, null);
            issue(4001, "가까운 이슈", "요약");
            event(4001, 10, null); // 거리 0.015
            inIssue(4001, 4001);
            issue(4002, "먼 이슈", "요약");
            event(4002, 60, null); // 거리 0.5 — 상한 밖
            inIssue(4002, 4002);
            long job = waitingIssue(OWN);

            service.dispatchIssue();

            assertThat(ids(candidates(job).get("issues"), "issueId")).containsExactly(4001L);
        }

        // 상한 때문에 후보 이슈가 하나도 없어도 멈추지 않는다 — 빈 후보로 넣고, 워커가 묻지 않고 NONE 으로 끝낸다
        @Test
        void anEventWithEveryIssueTooFarStillGoesToTheQueue() {
            event(OWN, 0, null);
            issue(4002, "먼 이슈", "요약");
            event(4002, 60, null);
            inIssue(4002, 4002);
            long job = waitingIssue(OWN);

            service.dispatchIssue();

            assertThat(candidates(job).get("issues")).isEmpty();
            assertThat(jobState(job)).isEqualTo("QUEUED 후보 있음 넣음");
        }
    }

    // 켜 두면 ATTACH 가 발표에 쓸 이슈의 요약을 다시 쓰고 분야를 다시 계산한다(고정 28개 목록을 보지 않는다)
    // 이 묶음은 운영 설정 중 둘을 켠다 — 요약 덮어쓰기를 끄고, 메인 흐름 사건이 없는 CREATE 는 이슈를 만들지 않는다(Jira 224).
    // (운영의 후보 거리 상한 0.40 은 위 CandidateDistanceCap 묶음이 따로 본다)
    // 가드 시험을 따로 묶으면 시험용 앱이 하나 늘어 CI DB 연결 상한에 가까워져 여기에 함께 둔다
    @Nested
    @NestedTestConfiguration(EnclosingConfiguration.OVERRIDE)
    @SpringBootTest
    @AutoConfigureMockMvc
    @Import(TestcontainersConfiguration.class)
    @TestPropertySource(
            properties = {
                "newlearn.internal.worker-key=" + IssueStageIntegrationTest.WORKER_KEY,
                "newlearn.internal.batch-key=batch-key-for-issue-stage-test",
                "newlearn.analysis.issue.rewrite-summary-on-attach=false",
                "newlearn.analysis.issue.create-min-main-events=1"
            })
    class AttachWithoutRewrite {

        @Test
        void attachPutsTheEventInButKeepsTheSummaryAndCategory() throws Exception {
            issue(4001, "북항 상어 출몰", "옛 요약");
            event(4001, 10, "economy");
            inIssue(4001, 4001);
            // 기사에서 셈하면 나올 수 없는 분야를 미리 넣어 둔다 — 다시 계산했는지 바로 갈린다
            jdbc.sql("insert into issue_category(issue_id,category_code) values (4001,'society')")
                    .update();
            event(OWN, 0, "politics");
            long job = dispatched(OWN);

            w1(job, envelope(1, "issue-v1", attach(4001, "새 요약"))).andExpect(status().isNoContent());

            assertThat(issueOf(OWN)).as("사건은 이슈에 들어간다").isEqualTo(4001);
            assertThat(issueColumn(4001, "title")).isEqualTo("북항 상어 출몰");
            assertThat(issueColumn(4001, "summary")).as("요약은 그대로").isEqualTo("옛 요약");
            assertThat(categories(4001)).as("분야도 그대로").containsExactly("society");
            assertThat(jobState(job)).startsWith("SUCCEEDED");
        }

        // CREATE 는 새 이슈라 덮어쓸 것이 없다 — 설정과 상관없이 분야를 계산한다
        @Test
        void createStillComputesTheCategory() throws Exception {
            event(4011, 5, "economy");
            event(4012, 8, "economy");
            event(OWN, 0, "politics");
            long job = dispatched(OWN);

            w1(job, envelope(1, "issue-v1", create("북항 상어 출몰", "요약", OWN, 4011, 4012)))
                    .andExpect(status().isNoContent());

            assertThat(categories(issueOf(OWN))).containsExactly("economy");
        }

        // ── 메인 흐름 가드 (Jira 224) ──

        // 고른 사건이 모두 서브 흐름이면 이슈를 만들지 않는다 — 작업은 성공으로 끝나고 사건은 이슈 밖에 그대로다
        @Test
        void createWithoutAMainEventMakesNoIssue() throws Exception {
            event(4011, 5, null, "2026-10-05T00:00:00Z", "REACTION");
            event(4012, 8, null, "2026-10-05T00:00:00Z", "REACTION");
            event(OWN, 0, null, "2026-10-05T00:00:00Z", "REACTION");
            long job = dispatched(OWN);

            w1(job, envelope(1, "issue-v1", create("서브만 이슈", "반응만 이어졌다.", OWN, 4011, 4012)))
                    .andExpect(status().isNoContent());

            assertThat(issueOf(OWN)).as("이슈를 만들지 않았다").isZero();
            assertThat(issueOf(4011)).isZero();
            assertThat(issueOf(4012)).isZero();
            assertThat(count("select count(*) from issue where title = '서브만 이슈'"))
                    .isZero();
            assertThat(jobState(job)).startsWith("SUCCEEDED");
            assertThat(record(job).get("reason").asString())
                    .as("판정 기록에는 까닭이 남는다")
                    .isEqualTo("한 흐름의 사건들이다");
        }

        // 메인 흐름 사건이 하나라도 섞이면 지금처럼 만든다
        @Test
        void createWithOneMainEventStillMakesTheIssue() throws Exception {
            event(4011, 5, null);
            event(4012, 8, null, "2026-10-05T00:00:00Z", "REACTION");
            event(OWN, 0, null, "2026-10-05T00:00:00Z", "REACTION");
            long job = dispatched(OWN);

            w1(job, envelope(1, "issue-v1", create("메인 있는 이슈", "일이 있었고 반응이 이어졌다.", OWN, 4011, 4012)))
                    .andExpect(status().isNoContent());

            long created = issueOf(OWN);
            assertThat(created).as("새 이슈에 들어갔다").isNotZero();
            assertThat(issueOf(4011)).isEqualTo(created);
            assertThat(issueOf(4012)).isEqualTo(created);
        }

        // 가드는 후보 검사 뒤에 선다 — 서브만이어도 보낸 후보 밖 사건을 고르면 지금처럼 400 이다(계약 · AC-8)
        @Test
        void aReactionOnlyCreateOutsideTheCandidatesIsStillRejected() throws Exception {
            event(4011, 5, null, "2026-10-05T00:00:00Z", "REACTION");
            event(OWN, 0, null, "2026-10-05T00:00:00Z", "REACTION");
            long job = dispatched(OWN);
            event(4060, 1, null, "2026-10-05T00:00:00Z", "REACTION");

            w1(job, envelope(1, "issue-v1", create("서브만 이슈", "요약", OWN, 4011, 4060)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("RESULT_SCHEMA_INVALID"));

            assertThat(issueOf(OWN)).isZero();
            assertThat(issueOf(4011)).isZero();
        }
    }

    // ── 도우미 ──

    private void article(long id, @Nullable String category) {
        jdbc.sql("""
                insert into article(id,source,url,press_code,title,body,published_at,category_code,created_at)
                values (:id,'NEWSDATA',:url,:press,:title,'본문','2026-10-06T01:00:00Z',:category,now())
                """)
                .param("id", id)
                .param("url", "https://fixture.invalid/issue40/" + id)
                .param("press", PRESS)
                .param("title", "이슈 기사 " + id)
                .param("category", category)
                .update();
    }

    private void embedding(long articleId, double degrees) {
        jdbc.sql(
                        "insert into article_embedding(article_id,model,embedding) values (:id,'BGE-m3-ko',cast(:v as vector))")
                .param("id", articleId)
                .param("v", unitVector(degrees))
                .update();
    }

    private void event(long id, double degrees, @Nullable String category) {
        event(id, degrees, category, "2026-10-05T00:00:00Z");
    }

    // 사건과 그 사건을 만든 기사(같은 번호) — 기사 벡터는 [cos θ, sin θ, 0, …]
    private void event(long id, double degrees, @Nullable String category, String occurredAt) {
        event(id, degrees, category, occurredAt, "MAIN");
    }

    // 역할을 고르는 판 — 서브 흐름(REACTION) 사건을 만들 때 쓴다(Jira 224)
    private void event(long id, double degrees, @Nullable String category, String occurredAt, String role) {
        article(id, category);
        embedding(id, degrees);
        jdbc.sql("""
                insert into event(id,title,label,summary,occurred_at,occurred_at_basis,created_at,updated_at,role)
                values (:id,:title,:label,:summary,cast(:at as timestamptz),'EXTRACTED',now(),now(),:role)
                """)
                .param("id", id)
                .param("title", "사건 " + id)
                .param("label", "키워드 " + id)
                .param("summary", "요약 " + id)
                .param("at", occurredAt)
                .param("role", role)
                .update();
        link(id, id);
    }

    // 묶은 때는 기사 번호 순서다(10월 6일 0시 + 번호 끝자리 분) — 판정이 한 번에 하나씩 묶는 순서와 같게
    private void link(long articleId, long eventId) {
        link(articleId, eventId, articleId - 4000);
    }

    private void link(long articleId, long eventId, long minutes) {
        jdbc.sql("""
                insert into article_event(article_id,event_id,linked_at)
                values (:a,:e,cast('2026-10-06T00:00:00Z' as timestamptz) + make_interval(mins => :m))
                """)
                .param("a", articleId)
                .param("e", eventId)
                .param("m", (int) minutes)
                .update();
    }

    private void issue(long id, String title, String summary) {
        jdbc.sql("insert into issue(id,title,summary,created_at,updated_at) values (:id,:title,:summary,now(),now())")
                .param("id", id)
                .param("title", title)
                .param("summary", summary)
                .update();
    }

    private void inIssue(long eventId, long issueId) {
        jdbc.sql("update event set issue_id = :issue where id = :id")
                .param("issue", issueId)
                .param("id", eventId)
                .update();
    }

    // 판정 NEW 가 만드는 모양 그대로 — 후보 없이 QUEUED, 큐에 넣지 않음
    private long waitingIssue(long articleId) {
        return jdbc.sql("""
                insert into analysis_job(article_id,stage,status,requested_by,attempt,created_at,queued_at)
                values (:article,'ISSUE','QUEUED','BATCH',1,now(),now())
                returning id
                """).param("article", articleId).query(Long.class).single();
    }

    // 대기 작업을 만들고 고르기까지 — 고른 작업 ID
    private long dispatched(long articleId) {
        long job = waitingIssue(articleId);
        service.dispatchIssue();
        assertThat(jobState(job)).as("고르기가 이 작업을 골랐다").isEqualTo("QUEUED 후보 있음 넣음");
        return job;
    }

    // 판정할 준비가 된 기사 — 마인드맵(대표 사건 0번 잎) · 벡터 · EXTRACT · EMBED 성공
    private void readyForMatch(long articleId) {
        article(articleId, null);
        jdbc.sql("""
                insert into article_mindmap(article_id,summary,content,primary_core_index,occurred_at,schema_version,
                    model,prompt_version,generated_at)
                values (:id,'요약',cast(:content as jsonb),0,'2026-10-05T15:00:00Z','mindmap-v1','gpt-6-luna',
                    'extract-v1',now())
                """)
                .param("id", articleId)
                .param(
                        "content",
                        "{\"title\": null, \"branches\": [{\"type\": \"CORE\", \"items\": [{\"text\": \"상어가 나타났다\", \"evidence\": []}]}]}")
                .update();
        embedding(articleId, 0);
        for (String stage : List.of("EXTRACT", "EMBED")) {
            jdbc.sql("""
                    insert into analysis_job(article_id,stage,status,requested_by,attempt,created_at,queued_at,published_at)
                    values (:article,:stage,'SUCCEEDED','BATCH',1,now(),now(),now())
                    """).param("article", articleId).param("stage", stage).update();
        }
    }

    private long jobId(long articleId, String stage) {
        return jdbc.sql("select id from analysis_job where article_id = :id and stage = :stage")
                .param("id", articleId)
                .param("stage", stage)
                .query(Long.class)
                .single();
    }

    // 「상태 후보 넣음」 한 줄 — 단언 하나로 셋을 본다
    private String jobState(long jobId) {
        return jdbc.sql("""
                select status
                    || case when candidates is null then ' 후보 없음' else ' 후보 있음' end
                    || case when published_at is null then ' 안 넣음' else ' 넣음' end
                from analysis_job where id = :id
                """).param("id", jobId).query(String.class).single();
    }

    // 고르기가 남긴 후보 — 비었으면 DB 예외가 아니라 단언에서 갈리게
    private String candidatesText(long jobId) {
        String text = jdbc.sql("select coalesce(candidates::text, '') from analysis_job where id = :id")
                .param("id", jobId)
                .query(String.class)
                .single();
        assertThat(text).as("고르기가 후보를 남겼다").isNotEmpty();
        return text;
    }

    private JsonNode candidates(long jobId) {
        return jsonMapper.readTree(candidatesText(jobId));
    }

    // 판정 기록 analysis_job.result — { reason, model, promptVersion }
    private JsonNode record(long jobId) {
        return jsonMapper.readTree(jdbc.sql("select result::text from analysis_job where id = :id")
                .param("id", jobId)
                .query(String.class)
                .single());
    }

    // 기사가 붙은 사건
    private long linkedEvent(long articleId) {
        return count("select event_id from article_event where article_id = " + articleId);
    }

    // 사건이 든 이슈. 이슈 밖이면 0 — 「결과 없음」 예외가 아니라 단언에서 갈리게
    private long issueOf(long eventId) {
        return count("select coalesce(issue_id, 0) from event where id = " + eventId);
    }

    private String issueColumn(long issueId, String column) {
        return jdbc.sql("select " + column + " from issue where id = :id")
                .param("id", issueId)
                .query(String.class)
                .single();
    }

    private List<String> categories(long issueId) {
        return jdbc.sql("select category_code from issue_category where issue_id = :id order by category_code")
                .param("id", issueId)
                .query(String.class)
                .list();
    }

    private long count(String sql) {
        return jdbc.sql(sql).query(Long.class).single();
    }

    private static List<Long> ids(JsonNode array, String field) {
        return StreamSupport.stream(array.spliterator(), false)
                .map(node -> node.get(field).asLong())
                .toList();
    }

    private static List<String> names(JsonNode node) {
        return node.properties().stream().map(Map.Entry::getKey).toList();
    }

    private JsonNode lastMessage() {
        List<MapRecord<String, Object, Object>> last = redis.opsForStream()
                .reverseRange(
                        AnalysisStreams.ISSUE, Range.unbounded(), Limit.limit().count(1));
        assertThat(last).hasSize(1);
        return jsonMapper.readTree((String) last.getFirst().getValue().get("payload"));
    }

    private ResultActions w1(long jobId, String body) throws Exception {
        return mvc.perform(post("/internal/v1/analysis-jobs/{jobId}/result", jobId)
                .header("X-Internal-Key", WORKER_KEY)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private static String envelope(int attempt, String promptVersion, String result) {
        return """
                {"attempt": %d, "status": "SUCCEEDED", "model": "gpt-6-luna", "promptVersion": "%s",
                 "startedAt": "2026-10-29T09:00:00+09:00", "finishedAt": "2026-10-29T09:00:30+09:00",
                 "result": %s, "error": null}
                """.formatted(attempt, promptVersion, result);
    }

    private static String failed(int attempt, String code) {
        return """
                {"attempt": %d, "status": "FAILED", "model": "gpt-6-luna", "promptVersion": "issue-v1",
                 "startedAt": "2026-10-29T09:00:00+09:00", "finishedAt": "2026-10-29T09:00:30+09:00",
                 "result": null, "error": {"code": "%s", "message": "실패"}}
                """.formatted(attempt, code);
    }

    private static String newEvent() {
        return """
                {"decision": "NEW", "eventId": null, "reason": "후보와 다른 사건이다",
                 "newEvent": {"title": "북항친수공원 수로에 상어 출몰", "label": "첫 목격", "summary": "상어가 나타났다.",
                              "role": "MAIN", "reactsTo": null}}""";
    }

    private static String attach(long issueId, String summary) {
        return """
                {"decision": "ATTACH", "issueId": %d, "issueSummary": "%s", "reason": "같은 흐름이다"}""".formatted(issueId, summary);
    }

    private static String create(String title, String summary, long... eventIds) {
        return """
                {"decision": "CREATE", "eventIds": %s, "issueTitle": "%s", "issueSummary": "%s", "reason": "한 흐름의 사건들이다"}""".formatted(
                        LongStream.of(eventIds).mapToObj(String::valueOf).collect(Collectors.joining(",", "[", "]")),
                        title,
                        summary);
    }

    private static String none() {
        return """
                {"decision": "NONE", "reason": "아직 이슈로 묶을 사건이 없다"}""";
    }

    // 앞 두 칸만 쓰는 단위 벡터 [cos θ, sin θ, 0, …] — 두 벡터의 코사인 유사도가 cos(각도 차)가 된다
    private static String unitVector(double degrees) {
        double radians = Math.toRadians(degrees);
        return IntStream.range(0, 1024)
                .mapToObj(i ->
                        i == 0 ? String.valueOf(Math.cos(radians)) : i == 1 ? String.valueOf(Math.sin(radians)) : "0")
                .collect(Collectors.joining(",", "[", "]"));
    }
}
