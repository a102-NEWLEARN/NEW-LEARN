package kr.io.newlearn.analysis;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import kr.io.newlearn.analysis.queue.AnalysisMessageFactory;
import kr.io.newlearn.analysis.queue.AnalysisStreams;
import kr.io.newlearn.analysis.queue.JobPublisher;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

// 1분 스케줄러(AnalysisJobScheduler)가 부른다 — 다시 걸 때가 된 실패를 다시 걸고, 큐에 넣었다는 표시가 없는 작업을 넣는다 (Jira 30)
// 배포 중 Pod 둘이 같이 돌아도 조건부 갱신이라 한 번만 된다. 시험은 스케줄러를 끄고 시각을 넘겨 부른다
@Service
public class AnalysisJobRecovery {

    private static final Logger log = LoggerFactory.getLogger(AnalysisJobRecovery.class);

    // 큐에 넣었다는 표시가 이만큼 없으면 다시 넣는다. 커밋 뒤 넣기와 겹치지 않게 조금 기다린다
    static final Duration UNPUBLISHED_AFTER = Duration.ofMinutes(1);

    // 한 번에 보는 작업 수
    private static final int BATCH = 100;

    private final AnalysisJobRepository jobs;
    private final AnalysisMessageFactories messages;
    private final AnalysisJobQueueing queueing;
    private final JobPublisher publisher;
    private final TransactionTemplate transaction;

    AnalysisJobRecovery(
            AnalysisJobRepository jobs,
            AnalysisMessageFactories messages,
            AnalysisJobQueueing queueing,
            JobPublisher publisher,
            PlatformTransactionManager transactions) {
        this.jobs = jobs;
        this.messages = messages;
        this.queueing = queueing;
        this.publisher = publisher;
        this.transaction = new TransactionTemplate(transactions);
    }

    // 다시 걸 때가 된 실패를 attempt + 1 로 건다. 다시 건 작업 수를 돌려준다
    // 한 행이 실패해도 나머지는 계속한다
    public int retryDue(Instant now) {
        int requeued = 0;
        for (AnalysisJob candidate : jobs.findByStatusAndRetryAtLessThanEqualOrderByRetryAtAsc(
                AnalysisJobStatus.FAILED, now, Limit.of(BATCH))) {
            try {
                Boolean done = transaction.execute(status -> {
                    int changed = jobs.requeueFailed(
                            candidate.getId(),
                            candidate.getAttempt(),
                            AnalysisJobStatus.FAILED,
                            AnalysisJobStatus.QUEUED,
                            now);
                    if (changed != 1) {
                        return false; // 다른 Pod 가 먼저 걸었다
                    }
                    queueing.queueRequeued(jobs.findById(candidate.getId()).orElseThrow());
                    return true;
                });
                if (Boolean.TRUE.equals(done)) {
                    requeued++;
                }
            } catch (RuntimeException e) {
                log.warn("실패한 작업을 다시 걸지 못했다 — 다음 차례에 또 본다: job={}", candidate.getId(), e);
            }
        }
        return requeued;
    }

    // QUEUED 인데 큐에 넣었다는 표시가 1분 넘게 없는 작업을 넣는다. 넣은 작업 수를 돌려준다
    // 「내가 넣는다」를 먼저 적고(markPublished) 넣어서, Pod 둘이 같이 돌아도 한 번만 넣는다. 넣다 실패하면 표시를 지우고
    // 이번 차례를 끝낸다 — Redis 가 끊겼으면 나머지도 못 넣는다
    public int publishUnpublished(Instant now) {
        int published = 0;
        List<AnalysisJob> candidates = jobs.findUnpublished(
                AnalysisJobStatus.QUEUED,
                now.minus(UNPUBLISHED_AFTER),
                messages.stages(),
                AnalysisStage.ISSUE,
                Limit.of(BATCH));
        for (AnalysisJob candidate : candidates) {
            AnalysisMessageFactory factory = messages.forStage(candidate.getStage());
            String payload;
            try {
                // execute 는 콜백이 돌려준 null 을 그대로 돌려준다(<T extends @Nullable Object>).
                // NullAway 기본 모드는 제네릭의 null 을 못 읽어 콜백의 null 반환을 잘못 막는다 — 끄는 곳은 이 한 줄뿐이다
                @SuppressWarnings("NullAway")
                String built = transaction.execute(status -> markAndBuild(candidate, factory, now));
                payload = built;
            } catch (RuntimeException e) {
                log.warn("큐에 다시 넣을 메시지를 못 만들었다: job={}", candidate.getId(), e);
                continue;
            }
            if (payload == null) {
                continue;
            }
            try {
                publisher.publish(AnalysisStreams.of(candidate.getStage()), payload);
                published++;
            } catch (RuntimeException e) {
                log.warn("큐에 다시 못 넣었다 — 다음 차례에 또 넣는다: job={}", candidate.getId(), e);
                transaction.executeWithoutResult(status ->
                        jobs.unmarkPublished(candidate.getId(), candidate.getAttempt(), AnalysisJobStatus.QUEUED));
                break;
            }
        }
        return published;
    }

    // 「내가 넣는다」를 적고 메시지를 만든다. 다른 Pod 가 먼저 넣었으면 null
    private @Nullable String markAndBuild(AnalysisJob candidate, AnalysisMessageFactory factory, Instant now) {
        if (jobs.markPublished(candidate.getId(), candidate.getAttempt(), AnalysisJobStatus.QUEUED, now) != 1) {
            return null;
        }
        return factory.payload(List.of(jobs.findById(candidate.getId()).orElseThrow()));
    }
}
