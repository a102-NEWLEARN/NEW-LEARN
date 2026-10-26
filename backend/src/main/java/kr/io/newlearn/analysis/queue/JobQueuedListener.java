package kr.io.newlearn.analysis.queue;

import java.time.Instant;
import kr.io.newlearn.analysis.AnalysisJobRepository;
import kr.io.newlearn.analysis.AnalysisJobStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

// 작업 행이 DB 에 커밋된 뒤에만 큐에 넣는다 — 그래야 워커가 없는 작업을 받지 않는다 (docs/api-internal.md 3절)
// 넣다 실패하면(Redis 끊김) published_at 이 빈 채로 남고, 1분 뒤 스케줄러(AnalysisJobScheduler)가 다시 넣는다
@Component
class JobQueuedListener {

    private static final Logger log = LoggerFactory.getLogger(JobQueuedListener.class);

    private final JobPublisher publisher;
    private final AnalysisJobRepository jobs;
    private final TransactionTemplate newTransaction;

    JobQueuedListener(JobPublisher publisher, AnalysisJobRepository jobs, PlatformTransactionManager transactions) {
        this.publisher = publisher;
        this.jobs = jobs;
        // 커밋 뒤에는 앞 트랜잭션에 끼어들 수 없어 새 트랜잭션으로 적는다
        this.newTransaction = new TransactionTemplate(transactions);
        this.newTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void publish(JobQueuedEvent event) {
        try {
            publisher.publish(event.stream(), event.payload());
        } catch (RuntimeException e) {
            log.warn("큐에 못 넣었다 — 스케줄러가 다시 넣는다: stream={} jobs={}", event.stream(), event.jobs(), e);
            return;
        }
        Instant now = Instant.now();
        newTransaction.executeWithoutResult(status -> event.jobs()
                .forEach(job -> jobs.markPublished(job.id(), job.attempt(), AnalysisJobStatus.QUEUED, now)));
    }
}
