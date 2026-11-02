package kr.io.newlearn.analysis;

import java.time.Duration;
import java.time.Instant;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

// 판정 · ISSUE 고르기(MatchDispatcher · IssueDispatcher)가 같이 쓰는 줄 세우기 — 트랜잭션 잠금과 「멈췄을 수 있다」 판정
// (docs/api-internal.md 3절). 잠금 키 · 로그 글자는 고르기마다 다르니 부르는 쪽이 갖는다
@Component
public class DispatchLine {

    // 진행 중인 작업이 이만큼 QUEUED 면 멈춘 것으로 본다. 건강한 작업은 워커 상한(15분) 안에 끝나고, 처리 중 워커가 죽어도
    // 다시 가져가기(20분) + 다른 워커의 처리(15분) 안에 끝난다 (api-internal.md 3절, Jira 130)
    public static final Duration STUCK_AFTER = Duration.ofMinutes(40);

    private final JdbcClient jdbc;
    private final AnalysisJobRepository jobs;

    DispatchLine(JdbcClient jdbc, AnalysisJobRepository jobs) {
        this.jdbc = jdbc;
        this.jobs = jobs;
    }

    // API Pod 둘이 같이 골라도 하나씩 고르게 트랜잭션 잠금(pg_advisory_xact_lock)을 잡는다 — 잠금은 커밋까지 간다.
    // 기사 · 작업 행을 FOR UPDATE 로 잠그지 않는다 — 작업을 넣을 때 외래 키 검사가 기사 행에 KEY SHARE 를 잡을 뿐이라
    // W1 의 작업 행 잠금 · 기사 공개(UPDATE)와 서로 기다리지 않는다
    public void enter(long lockKey, String work) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException(work + "는 트랜잭션 안에서 불러야 한다");
        }
        jdbc.sql("select 1 from pg_advisory_xact_lock(:key)")
                .param("key", lockKey)
                .query(Integer.class)
                .single();
    }

    // QUEUED 인 작업에 W1 이 끝내 안 오면(넣은 뒤 메시지를 잃음 · 워커가 W1 없이 ack) 그 줄 전체가 멈춘다(api-internal.md 3절)
    public boolean stuck(long jobId) {
        Instant stuckBefore = Instant.now().minus(STUCK_AFTER);
        return jobs.findById(jobId)
                .filter(job -> job.isQueued() && job.getQueuedAt().isBefore(stuckBefore))
                .isPresent();
    }
}
