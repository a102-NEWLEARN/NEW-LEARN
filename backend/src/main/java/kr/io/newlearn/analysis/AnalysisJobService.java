package kr.io.newlearn.analysis;

import java.time.Instant;
import java.util.List;
import kr.io.newlearn.analysis.dto.JobResultRequest;
import kr.io.newlearn.analysis.issue.IssueDispatcher;
import kr.io.newlearn.analysis.match.MatchDispatcher;
import kr.io.newlearn.article.Article;
import kr.io.newlearn.common.error.ApiException;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.NotFoundException;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

// 분석 작업을 걸고(투입), 결과(W1)를 받고, 다음 판정 · ISSUE 를 고른다 (Jira 30, docs/api-internal.md 3 ~ 6절)
// 단계별 결과 저장은 AnalysisResultHandler, 큐에 넣기 · 실패 남기기는 AnalysisJobQueueing,
// 1분 스케줄러의 다시 걸기 · 못 넣은 작업 넣기는 AnalysisJobRecovery 가 맡는다
@Service
public class AnalysisJobService {

    private static final Logger log = LoggerFactory.getLogger(AnalysisJobService.class);

    // 결과를 저장하다 예상 밖 오류가 나면 이 코드로 실패를 남긴다 — 정책상 1분 뒤 한 번만 더 건다(api.md 2절)
    static final String INTERNAL = "INTERNAL";

    private final AnalysisJobRepository jobs;
    private final AnalysisResultHandlers handlers;
    private final AnalysisJobQueueing queueing;
    private final MatchDispatcher matches;
    private final IssueDispatcher issues;
    private final TransactionTemplate transaction;

    AnalysisJobService(
            AnalysisJobRepository jobs,
            AnalysisResultHandlers handlers,
            AnalysisJobQueueing queueing,
            MatchDispatcher matches,
            IssueDispatcher issues,
            PlatformTransactionManager transactions) {
        this.jobs = jobs;
        this.handlers = handlers;
        this.queueing = queueing;
        this.matches = matches;
        this.issues = issues;
        this.transaction = new TransactionTemplate(transactions);
    }

    // 투입(B1, Jira 34)이 부른다 — EXTRACT · EMBED 작업을 만들고, 커밋 뒤 analysis.released 에 메시지 하나를 넣는다
    @Transactional
    public List<AnalysisJob> queueRelease(Article article) {
        AnalysisJob extract = jobs.save(new AnalysisJob(article, AnalysisStage.EXTRACT, RequestedBy.BATCH, null));
        AnalysisJob embed = jobs.save(new AnalysisJob(article, AnalysisStage.EMBED, RequestedBy.BATCH, null));
        List<AnalysisJob> created = List.of(extract, embed);
        queueing.queueAfterCommit(created);
        return created;
    }

    // W1 — 이번 시도의 결과를 저장한다. 처리기가 결과를 거절하면(ResultSchemaInvalidException) 처리기가 쓴 것은 되돌리고,
    // 새 트랜잭션에서 RESULT_SCHEMA_INVALID 로 실패를 남긴 뒤(바로 한 번 더 건다) 400 을 준다. 결과는 맞는데 그사이 저장할 상태가
    // 바뀌었으면(ResultConflictException, ISSUE) 같은 식으로 JOB_STATE_CONFLICT 를 남기고(바로 다시, 시도 3까지) 409 를 준다.
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
                    queueing.recordFailure(
                            job, request.error().code(), request.error().message(), startedAt, finishedAt, now);
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
            recordFailureInNewTransaction(
                    jobId, attempt, ErrorCode.RESULT_SCHEMA_INVALID.name(), e.getMessage(), request, now);
            throw new ApiException(ErrorCode.RESULT_SCHEMA_INVALID, e.getMessage());
        } catch (ResultConflictException e) {
            // ISSUE 결과는 맞는데 그사이 사건 · 이슈가 바뀌었다 — 처리기가 쓴 것은 되돌아갔다. JOB_STATE_CONFLICT 로 실패를 남기면
            // 정책상 바로 다시 걸린다(시도 3까지). 워커는 409 를 받고 ack 한다 (api-internal.md 5절, Jira 40)
            recordFailureInNewTransaction(
                    jobId, attempt, ErrorCode.JOB_STATE_CONFLICT.name(), e.getMessage(), request, now);
            throw new ApiException(ErrorCode.JOB_STATE_CONFLICT, e.getMessage());
        } catch (ApiException e) {
            throw e; // 404 · 409 — 작업을 건드리지 않는다
        } catch (RuntimeException e) {
            recordUnexpected(jobId, attempt, request, now, e);
            throw e;
        } finally {
            // 성공 · 실패 모두 — 판정이 끝났거나 멈췄으면 다음 기사를, EXTRACT · EMBED 가 끝났으면 이 기사를 걸 차례일 수 있다.
            // 판정이 새 사건을 만들었거나 ISSUE 가 끝났거나 멈췄으면 다음 ISSUE 를 걸 차례일 수 있다
            dispatchMatchQuietly();
            dispatchIssueQuietly();
        }
    }

    // 결과를 저장한 트랜잭션은 되돌아갔다 — 새 트랜잭션에서 작업을 다시 잠그고 실패를 남긴다
    private void recordFailureInNewTransaction(
            long jobId, int attempt, String code, @Nullable String message, JobResultRequest request, Instant now) {
        transaction.executeWithoutResult(status -> queueing.recordFailure(
                lockCurrentAttempt(jobId, attempt),
                code,
                message,
                request.startedAtOr(now),
                request.finishedAtOr(now),
                now));
    }

    private void recordUnexpected(
            long jobId, int attempt, JobResultRequest request, Instant now, RuntimeException cause) {
        try {
            recordFailureInNewTransaction(
                    jobId,
                    attempt,
                    INTERNAL,
                    "API 가 결과를 저장하지 못했다: " + cause.getClass().getSimpleName(),
                    request,
                    now);
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

    // 다음 판정 고르기(Jira 35) — 고른 판정 작업을 커밋 뒤 큐에 넣는다. W1 을 처리한 뒤와 1분 스케줄러가 부른다
    public void dispatchMatch() {
        transaction.executeWithoutResult(
                status -> matches.next().ifPresent(job -> queueing.queueAfterCommit(List.of(job))));
    }

    // 다음 ISSUE 고르기(Jira 40) — 고른 ISSUE 작업을 커밋 뒤 큐에 넣는다. W1 을 처리한 뒤와 1분 스케줄러가 부른다
    public void dispatchIssue() {
        transaction.executeWithoutResult(
                status -> issues.next().ifPresent(job -> queueing.queueAfterCommit(List.of(job))));
    }

    // W1 뒤에 고르다 실패해도 W1 응답은 그대로 둔다 — 1분 스케줄러가 다시 고른다
    private void dispatchMatchQuietly() {
        try {
            dispatchMatch();
        } catch (RuntimeException e) {
            log.warn("W1 뒤 판정 고르기를 건너뛴다 — 1분 스케줄러가 다시 고른다", e);
        }
    }

    private void dispatchIssueQuietly() {
        try {
            dispatchIssue();
        } catch (RuntimeException e) {
            log.warn("W1 뒤 ISSUE 고르기를 건너뛴다 — 1분 스케줄러가 다시 고른다", e);
        }
    }
}
