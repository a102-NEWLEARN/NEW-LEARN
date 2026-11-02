package kr.io.newlearn.analysis;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import kr.io.newlearn.analysis.queue.AnalysisStreams;
import kr.io.newlearn.analysis.queue.JobQueuedEvent;
import org.jspecify.annotations.Nullable;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

// 작업을 커밋 뒤 큐에 넣고, 실패를 남기고 다시 건다 — W1(AnalysisJobService)과 1분 스케줄러(AnalysisJobRecovery)가 같이 쓴다
@Component
class AnalysisJobQueueing {

    private final AnalysisMessageFactories messages;
    private final ApplicationEventPublisher events;

    AnalysisJobQueueing(AnalysisMessageFactories messages, ApplicationEventPublisher events) {
        this.messages = messages;
        this.events = events;
    }

    // 지금 트랜잭션이 커밋되면 큐에 넣는다(JobQueuedListener). 같은 기사 · 같은 시도 · 같은 스트림의 작업들
    void queueAfterCommit(List<AnalysisJob> group) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("커밋 뒤에 넣으려면 트랜잭션 안에서 불러야 한다");
        }
        AnalysisStage stage = group.getFirst().getStage();
        List<JobQueuedEvent.JobRef> refs = group.stream()
                .map(job -> new JobQueuedEvent.JobRef(job.getId(), job.getAttempt()))
                .toList();
        events.publishEvent(new JobQueuedEvent(
                AnalysisStreams.of(stage), messages.forStage(stage).payload(group), refs));
    }

    // 실패한 작업을 attempt + 1 로 다시 건 뒤(트랜잭션 안) — 단계 공장이 바로 넣으라면 커밋 뒤 큐에 넣는다.
    // ISSUE 는 후보를 비워 대기 작업으로 돌아가고 고르기가 다시 고른다(IssueMessageFactory.requeueNow)
    void queueRequeued(AnalysisJob job) {
        if (messages.forStage(job.getStage()).requeueNow(job)) {
            queueAfterCommit(List.of(job));
        }
    }

    // 실패를 남기고 다시 걸 때(retry_at)를 정한다. 바로 걸 코드(RESULT_SCHEMA_INVALID · JOB_STATE_CONFLICT)면 그 자리에서 건다 —
    // ISSUE 는 큐에 바로 넣지 않고 대기 작업으로 돌아간다(queueRequeued).
    // 간격은 API 가 실패를 받은 때부터 잰다 — 워커 시계가 틀려도 밀리지 않게
    void recordFailure(
            AnalysisJob job,
            String code,
            @Nullable String message,
            Instant startedAt,
            Instant finishedAt,
            Instant now) {
        RetryPolicy.Decision decision = RetryPolicy.decide(code, job.getAttempt());
        // STOP 이 아니면 delay 가 있다 (RetryPolicy.decide)
        Instant retryAt =
                decision.kind() == RetryPolicy.Kind.STOP ? null : now.plus(Objects.requireNonNull(decision.delay()));
        job.fail(code, message, startedAt, finishedAt, retryAt);
        if (decision.kind() == RetryPolicy.Kind.NOW) {
            job.requeue(now);
            queueRequeued(job);
        }
    }
}
