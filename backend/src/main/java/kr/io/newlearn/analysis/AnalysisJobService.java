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
            factory.stages().forEach(stage -> messages.put(stage, factory));
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
    // 작업은 RESULT_SCHEMA_INVALID 로 실패를 남긴 새 트랜잭션에서 바로 한 번 더 건 뒤 400 을 준다
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
                    job.fail(request.error().code(), request.error().message(), startedAt, finishedAt);
                    retryNowIfDue(job, now);
                    return;
                }
                handlers.forStage(job.getStage()).save(job, request);
                job.succeed(startedAt, finishedAt);
            });
        } catch (ResultSchemaInvalidException e) {
            transaction.executeWithoutResult(status -> {
                AnalysisJob job = lockCurrentAttempt(jobId, attempt);
                job.fail(
                        ErrorCode.RESULT_SCHEMA_INVALID.name(),
                        e.getMessage(),
                        request.startedAtOr(now),
                        request.finishedAtOr(now));
                retryNowIfDue(job, now);
            });
            throw new ApiException(ErrorCode.RESULT_SCHEMA_INVALID, e.getMessage());
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

    // 실패를 남긴 그 자리에서 바로 다시 걸 코드(RESULT_SCHEMA_INVALID)면 건다. 늦춰 걸 코드는 스케줄러가 건다
    private void retryNowIfDue(AnalysisJob job, Instant now) {
        if (RetryPolicy.decide(job.getErrorCode(), job.getAttempt()).kind() == RetryPolicy.Kind.NOW) {
            job.requeue(now);
            queueAfterCommit(List.of(job));
        }
    }

    // 스케줄러 — 간격이 지난 실패를 다시 건다(attempt + 1). 다시 건 작업 수를 돌려준다
    public int retryDue(Instant now) {
        int requeued = 0;
        List<AnalysisJob> candidates = jobs.findByStatusAndErrorCodeInAndAttemptLessThanOrderByFinishedAtAsc(
                AnalysisJobStatus.FAILED, RetryPolicy.retryableCodes(), RetryPolicy.MAX_ATTEMPTS, Limit.of(BATCH));
        for (AnalysisJob candidate : candidates) {
            RetryPolicy.Decision decision = RetryPolicy.decide(candidate.getErrorCode(), candidate.getAttempt());
            if (decision.kind() == RetryPolicy.Kind.STOP) {
                continue;
            }
            Instant failedAt = candidate.getFinishedAt() == null ? candidate.getQueuedAt() : candidate.getFinishedAt();
            if (failedAt.plus(decision.delay()).isAfter(now)) {
                continue;
            }
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
        }
        return requeued;
    }

    // 스케줄러 — QUEUED 인데 큐에 넣었다는 표시가 1분 넘게 없는 작업을 넣는다. 넣은 작업 수를 돌려준다
    // 「내가 넣는다」를 먼저 적고(markPublished) 넣어서, Pod 둘이 같이 돌아도 한 번만 넣는다. 넣다 실패하면 표시를 지운다
    public int publishUnpublished(Instant now) {
        int published = 0;
        List<AnalysisJob> candidates = jobs.findByStatusAndPublishedAtIsNullAndQueuedAtBeforeOrderByQueuedAtAsc(
                AnalysisJobStatus.QUEUED, now.minus(UNPUBLISHED_AFTER), Limit.of(BATCH));
        for (AnalysisJob candidate : candidates) {
            AnalysisMessageFactory factory = messages.get(candidate.getStage());
            if (factory == null) {
                continue;
            }
            String payload = transaction.execute(status -> {
                if (jobs.markPublished(candidate.getId(), candidate.getAttempt(), AnalysisJobStatus.QUEUED, now) != 1) {
                    return null;
                }
                return factory.payload(List.of(jobs.findById(candidate.getId()).orElseThrow()));
            });
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
            }
        }
        return published;
    }
}
