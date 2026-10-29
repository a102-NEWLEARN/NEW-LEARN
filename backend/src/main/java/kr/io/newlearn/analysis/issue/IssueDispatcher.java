package kr.io.newlearn.analysis.issue;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import kr.io.newlearn.analysis.AnalysisJob;
import kr.io.newlearn.analysis.AnalysisJobRepository;
import kr.io.newlearn.issue.IssueCandidateFinder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.json.JsonMapper;

// 다음 ISSUE 고르기 — ISSUE 를 거는 곳은 여기 한 군데다 (Jira 40, docs/api-internal.md 3절)
// 한 번에 하나씩, 대기 작업(후보가 빈 QUEUED) 중 작업 번호가 가장 작은 것부터 — 사건이 생긴 순서다. 같은 사건들로 이슈가 둘 생기거나
// 이미 이슈에 든 사건을 다른 이슈가 가져가지 않게 하려는 것이다. 판정 고르기(MatchDispatcher)와 따로 돈다 — 판정은 ISSUE 를
// 기다리지 않는다. AnalysisJobService 가 W1 을 처리한 뒤와 1분 스케줄러에서 부른다. 이 클래스는 서비스를 모른다(순환 없음)
@Component
public class IssueDispatcher {

    private static final Logger log = LoggerFactory.getLogger(IssueDispatcher.class);

    // ISSUE 고르기를 줄 세우는 트랜잭션 잠금(pg_advisory_xact_lock)의 키. 판정 고르기는 35(MatchDispatcher)
    static final long LOCK = 40L;

    // ISSUE 가 이만큼 QUEUED 면 멈춘 것으로 보고 WARN. 판정과 같은 까닭이다 — 워커 상한 15분, 처리 중 워커가 죽으면
    // 다시 가져가기(20분) + 다른 워커의 처리(15분) (api-internal.md 3절)
    static final Duration STUCK_AFTER = Duration.ofMinutes(40);

    private final JdbcClient jdbc;
    private final AnalysisJobRepository jobs;
    private final IssueCandidateFinder finder;
    private final JsonMapper jsonMapper;

    IssueDispatcher(JdbcClient jdbc, AnalysisJobRepository jobs, IssueCandidateFinder finder, JsonMapper jsonMapper) {
        this.jdbc = jdbc;
        this.jobs = jobs;
        this.finder = finder;
        this.jsonMapper = jsonMapper;
    }

    // 고른 ISSUE 작업(후보를 남김). 진행 중인 ISSUE 가 있거나 고를 대기 작업이 없으면 빈 값.
    // 트랜잭션 안에서 부른다 — 잠금이 커밋까지 간다. 큐에 넣는 일은 부른 쪽이 커밋 뒤에 한다
    public Optional<AnalysisJob> next() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("ISSUE 고르기는 트랜잭션 안에서 불러야 한다");
        }
        // API Pod 둘이 같이 골라도 하나씩 고른다. 작업 행을 FOR UPDATE 로 잠그지 않는다 — MatchDispatcher 와 같다
        jdbc.sql("select 1 from pg_advisory_xact_lock(:key)")
                .param("key", LOCK)
                .query(Integer.class)
                .single();
        Optional<Long> inFlight = jobs.findIssueInFlight();
        if (inFlight.isPresent()) {
            logWaiting(inFlight.get());
            return Optional.empty();
        }
        while (true) {
            Optional<Long> waiting = jobs.findNextWaitingIssue();
            if (waiting.isEmpty()) {
                return Optional.empty();
            }
            AnalysisJob job = jobs.findById(waiting.get()).orElseThrow();
            long articleId = job.getArticle().getId();
            Optional<IssueCandidateFinder.OwnEvent> own = finder.ownEvent(articleId);
            if (own.isEmpty() || own.get().issueId() != null) {
                // 사람이 사건 · 이슈를 고쳐 물을 것이 없다 — 묻지 않고 끝내고 다음 대기 작업을 본다.
                // 다음 대기 작업을 찾는 쿼리가 이 작업을 다시 읽지 않게 먼저 써 둔다
                Instant now = Instant.now();
                job.succeed(now, now);
                jobs.flush();
                log.info("ISSUE 를 묻지 않고 끝냄 jobId={} — 사건이 없거나 이미 이슈 안", job.getId());
                continue;
            }
            IssueCandidateFinder.Candidates candidates =
                    finder.find(articleId, own.get().id(), own.get().linkedAt());
            job.pick(jsonMapper.writeValueAsString(candidates), Instant.now());
            log.info(
                    "ISSUE 걸기 articleId={} jobId={} eventId={} 후보 이슈={} 후보 사건={}",
                    articleId,
                    job.getId(),
                    own.get().id(),
                    candidates.issues().size(),
                    candidates.events().size());
            return Optional.of(job);
        }
    }

    // QUEUED 인 ISSUE 에 W1 이 끝내 안 오면 ISSUE 줄 전체가 멈춘다(api-internal.md 3절). 찾을 수 있게 오래된 QUEUED 는 WARN —
    // 푸는 법은 판정과 같다(메시지를 잃었으면 손으로 published_at 을 비운다)
    private void logWaiting(long jobId) {
        Instant stuckBefore = Instant.now().minus(STUCK_AFTER);
        boolean stuck = jobs.findById(jobId)
                .filter(job -> job.isQueued() && job.getQueuedAt().isBefore(stuckBefore))
                .isPresent();
        if (stuck) {
            log.warn("ISSUE 줄이 멈췄을 수 있다: ISSUE 작업 {} 이 {}분 넘게 QUEUED", jobId, STUCK_AFTER.toMinutes());
        } else {
            log.info("ISSUE 고르기 기다림: ISSUE 작업 {}", jobId);
        }
    }
}
