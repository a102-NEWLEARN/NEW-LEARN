package kr.io.newlearn.analysis;

import java.time.Duration;
import java.time.Instant;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import kr.io.newlearn.analysis.dto.JobResultRequest;
import kr.io.newlearn.analysis.queue.AnalysisMessageFactory;
import kr.io.newlearn.analysis.queue.AnalysisStreams;
import kr.io.newlearn.analysis.queue.JobPublisher;
import kr.io.newlearn.analysis.queue.JobQueuedEvent;
import kr.io.newlearn.article.Article;
import kr.io.newlearn.common.error.ApiException;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.NotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

// 분석 작업을 큐에 걸고, 결과(W1)를 받고, 실패를 다시 건다 (Jira 30, docs/api-internal.md 3 ~ 6절)
// 단계별 결과 저장은 AnalysisResultHandler(56 · 35 · 40), 단계별 메시지는 AnalysisMessageFactory 가 맡는다
@Service
public class AnalysisJobService {

    private static final Logger log = LoggerFactory.getLogger(AnalysisJobService.class);

    // 큐에 넣었다는 표시가 이만큼 없으면 스케줄러가 다시 넣는다. 커밋 뒤 넣기와 겹치지 않게 조금 기다린다
    static final Duration UNPUBLISHED_AFTER = Duration.ofMinutes(1);

    // 결과를 저장하다 예상 밖 오류가 나면 이 코드로 실패를 남긴다 — 정책상 1분 뒤 한 번만 더 건다(api.md 2절)
    static final String INTERNAL = "INTERNAL";

    // 스케줄러가 한 번에 보는 작업 수
    private static final int BATCH = 100;

    private final AnalysisJobRepository jobs;
    private final AnalysisResultHandlers handlers;
    private final Map<AnalysisStage, AnalysisMessageFactory> messages = new EnumMap<>(AnalysisStage.class);
    private final ApplicationEventPublisher events;
    private final JobPublisher publisher;
    private final TransactionTemplate transaction;

    public AnalysisJobService(
            AnalysisJobRepository jobs,
            AnalysisResultHandlers handlers,
            List<AnalysisMessageFactory> factories,
            ApplicationEventPublisher events,
            JobPublisher publisher,
            PlatformTransactionManager transactions) {
        this.jobs = jobs;
        this.handlers = handlers;
        for (AnalysisMessageFactory factory : factories) {
            for (AnalysisStage stage : factory.stages()) {
                if (messages.put(stage, factory) != null) {
                    throw new IllegalStateException("한 단계에 메시지를 만드는 곳이 둘이다: " + stage);
                }
            }
        }
        this.events = events;
        this.publisher = publisher;
        this.transaction = new TransactionTemplate(transactions);
    }

    // 투입(B1, Jira 34)이 부른다 — EXTRACT · EMBED 작업을 만들고, 커밋 뒤 analysis.released 에 메시지 하나를 넣는다
    @Transactional
    public List<AnalysisJob> queueRelease(Article article) {
        AnalysisJob extract = jobs.save(new AnalysisJob(article, AnalysisStage.EXTRACT, RequestedBy.BATCH, null));
        AnalysisJob embed = jobs.save(new AnalysisJob(article, AnalysisStage.EMBED, RequestedBy.BATCH, null));
        List<AnalysisJob> created = List.of(extract, embed);
        queueAfterCommit(created);
        return created;
    }

    // 지금 트랜잭션이 커밋되면 큐에 넣는다(JobQueuedListener). 같은 기사 · 같은 시도 · 같은 스트림의 작업들
    void queueAfterCommit(List<AnalysisJob> group) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("커밋 뒤에 넣으려면 트랜잭션 안에서 불러야 한다");
        }
        AnalysisStage stage = group.getFirst().getStage();
        AnalysisMessageFactory factory = messages.get(stage);
        if (factory == null) {
            log.warn("이 단계의 메시지를 만들 곳이 아직 없다 — 큐에 넣지 않는다: stage={}", stage);
            return;
        }
        List<JobQueuedEvent.JobRef> refs = group.stream()
                .map(job -> new JobQueuedEvent.JobRef(job.getId(), job.getAttempt()))
                .toList();
        events.publishEvent(new JobQueuedEvent(AnalysisStreams.of(stage), factory.payload(group), refs));
    }

    // W1 — 이번 시도의 결과를 저장한다. 처리기가 결과를 거절하면(ResultSchemaInvalidException) 처리기가 쓴 것은 되돌리고,
    // 새 트랜잭션에서 RESULT_SCHEMA_INVALID 로 실패를 남긴 뒤(바로 한 번 더 건다) 400 을 준다.
    // 그 밖의 예상 밖 오류(처리기 버그 · 처리기 없음)는 INTERNAL 로 실패를 남기고 500 — 남기지 않으면 작업이 QUEUED 로 남아
    // 워커가 메시지를 다시 가져갈 때마다 GMS 를 상한 없이 부른다
    public void receiveResult(long jobId, JobResultRequest request) {
        if (request.attempt() == null) {
            throw new ApiException(ErrorCode.RESULT_SCHEMA_INVALID, "attempt 가 없다");
        }
        int attempt = request.attempt();
        Instant now = Instant.now();
        try {
            transaction.executeWithoutResult(status -> {
                AnalysisJob job = lockCurrentAttempt(jobId, attempt);
                String problem = request.problem();
                if (problem != null) {
                    throw new ResultSchemaInvalidException(problem);
                }
                Instant startedAt = request.startedAtOr(now);
                Instant finishedAt = request.finishedAtOr(now);
                if (request.status() == JobResultRequest.Status.FAILED) {
                    recordFailure(job, request.error().code(), request.error().message(), startedAt, finishedAt, now);
                    return;
                }
                handlers.forStage(job.getStage()).save(job, request);
                if (job.getStage() == AnalysisStage.EXTRACT) {
                    // 기사는 분석이 끝난 뒤부터 보인다 — 마인드맵을 처음 저장할 때 공개한다(Jira 34). 처리기가 거절하거나
                    // 실패하면 여기까지 오지 않아 공개되지 않는다
                    job.getArticle().markReleased(now);
                }
                job.succeed(startedAt, finishedAt);
            });
        } catch (ResultSchemaInvalidException e) {
            transaction.executeWithoutResult(status -> recordFailure(
                    lockCurrentAttempt(jobId, attempt),
                    ErrorCode.RESULT_SCHEMA_INVALID.name(),
                    e.getMessage(),
                    request.startedAtOr(now),
                    request.finishedAtOr(now),
                    now));
            throw new ApiException(ErrorCode.RESULT_SCHEMA_INVALID, e.getMessage());
        } catch (ApiException e) {
            throw e; // 404 · 409 — 작업을 건드리지 않는다
        } catch (RuntimeException e) {
            recordUnexpected(jobId, attempt, request, now, e);
            throw e;
        }
    }

    private void recordUnexpected(
            long jobId, int attempt, JobResultRequest request, Instant now, RuntimeException cause) {
        try {
            transaction.executeWithoutResult(status -> recordFailure(
                    lockCurrentAttempt(jobId, attempt),
                    INTERNAL,
                    "API 가 결과를 저장하지 못했다: " + cause.getClass().getSimpleName(),
                    request.startedAtOr(now),
                    request.finishedAtOr(now),
                    now));
        } catch (RuntimeException recordError) {
            // DB 가 죽었으면 여기도 실패한다 — 워커가 5xx 를 받고 다시 보내는 길로 남는다
            log.error("결과 저장 실패를 적지도 못했다: job={}", jobId, recordError);
        }
    }

    // 없는 작업 404, 이미 끝났거나 시도 번호가 다르면 409. 같은 결과가 두 번 와도 두 번째는 409 다
    private AnalysisJob lockCurrentAttempt(long jobId, int attempt) {
        AnalysisJob job = jobs.findForUpdate(jobId)
                .orElseThrow(() -> new NotFoundException(ErrorCode.ANALYSIS_JOB_NOT_FOUND, "분석 작업이 없다: " + jobId));
        if (!job.isQueued()) {
            throw new ApiException(
                    ErrorCode.JOB_STATE_CONFLICT, "이미 끝난 시도다: job=" + jobId + " status=" + job.getStatus());
        }
        if (job.getAttempt() != attempt) {
            throw new ApiException(
                    ErrorCode.JOB_STATE_CONFLICT, "시도 번호가 다르다: 지금 " + job.getAttempt() + ", 받은 값 " + attempt);
        }
        return job;
    }

    // 실패를 남기고 다시 걸 때(retry_at)를 정한다. 바로 걸 코드(RESULT_SCHEMA_INVALID)면 그 자리에서 건다.
    // 간격은 API 가 실패를 받은 때부터 잰다 — 워커 시계가 틀려도 밀리지 않게
    private void recordFailure(
            AnalysisJob job, String code, String message, Instant startedAt, Instant finishedAt, Instant now) {
        RetryPolicy.Decision decision = RetryPolicy.decide(code, job.getAttempt());
        Instant retryAt = decision.kind() == RetryPolicy.Kind.STOP ? null : now.plus(decision.delay());
        job.fail(code, message, startedAt, finishedAt, retryAt);
        if (decision.kind() == RetryPolicy.Kind.NOW) {
            job.requeue(now);
            queueAfterCommit(List.of(job));
        }
    }

    // 스케줄러 — 다시 걸 때가 된 실패를 attempt + 1 로 건다. 다시 건 작업 수를 돌려준다
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
                    queueAfterCommit(List.of(jobs.findById(candidate.getId()).orElseThrow()));
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

    // 스케줄러 — QUEUED 인데 큐에 넣었다는 표시가 1분 넘게 없는 작업을 넣는다. 넣은 작업 수를 돌려준다
    // 「내가 넣는다」를 먼저 적고(markPublished) 넣어서, Pod 둘이 같이 돌아도 한 번만 넣는다. 넣다 실패하면 표시를 지우고
    // 이번 차례를 끝낸다 — Redis 가 끊겼으면 나머지도 못 넣는다
    public int publishUnpublished(Instant now) {
        int published = 0;
        List<AnalysisJob> candidates = jobs.findByStatusAndPublishedAtIsNullAndQueuedAtBeforeOrderByQueuedAtAsc(
                AnalysisJobStatus.QUEUED, now.minus(UNPUBLISHED_AFTER), Limit.of(BATCH));
        for (AnalysisJob candidate : candidates) {
            AnalysisMessageFactory factory = messages.get(candidate.getStage());
            if (factory == null) {
                continue;
            }
            String payload;
            try {
                payload = transaction.execute(status -> {
                    if (jobs.markPublished(candidate.getId(), candidate.getAttempt(), AnalysisJobStatus.QUEUED, now)
                            != 1) {
                        return null; // 다른 Pod 가 먼저 넣었다
                    }
                    return factory.payload(
                            List.of(jobs.findById(candidate.getId()).orElseThrow()));
                });
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
}
