package kr.io.newlearn.analysis;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface AnalysisJobRepository extends JpaRepository<AnalysisJob, Long> {
    interface StateView {
        Long getArticleId();

        AnalysisJobStatus getStatus();

        String getErrorCode();
    }

    @Query(
            "select j.article.id as articleId, j.status as status, j.errorCode as errorCode from AnalysisJob j where j.article.id in :articleIds and j.stage = :stage")
    List<StateView> findStatesByArticleIdInAndStage(Collection<Long> articleIds, AnalysisStage stage);

    // W1 — 같은 작업의 결과 두 개가 동시에 와도 한 번만 저장하게 행을 잠그고 읽는다
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select j from AnalysisJob j where j.id = :id")
    Optional<AnalysisJob> findForUpdate(Long id);

    // 아래 조건부 갱신은 배포 중 API Pod 둘이 스케줄러를 같이 돌려도 한 쪽만 1 을 받는다 (Jira 30)
    // clearAutomatically 라 부른 뒤에는 같은 트랜잭션에서 앞서 읽은 엔티티가 떨어져 나간다 — 그 엔티티를 고치면 저장되지 않는다.
    // 부른 뒤에 행이 필요하면 다시 읽는다

    // 커밋 뒤 큐에 넣었다 — 이번 시도이고 아직 표시가 없을 때만 적는다
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
            "update AnalysisJob j set j.publishedAt = :now where j.id = :id and j.attempt = :attempt and j.status = :status and j.publishedAt is null")
    int markPublished(Long id, int attempt, AnalysisJobStatus status, Instant now);

    // 스케줄러는 큐에 넣기 전에 markPublished 로 「내가 넣는다」를 먼저 적는다. 넣다 실패하면 이것으로 되돌린다
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
            "update AnalysisJob j set j.publishedAt = null where j.id = :id and j.attempt = :attempt and j.status = :status")
    int unmarkPublished(Long id, int attempt, AnalysisJobStatus status);

    // 실패한 작업을 다시 건다 — 이번 시도가 아직 FAILED 일 때만 attempt + 1
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
            "update AnalysisJob j set j.status = :queued, j.attempt = j.attempt + 1, j.queuedAt = :now, j.publishedAt = null, j.retryAt = null where j.id = :id and j.attempt = :attempt and j.status = :failed")
    int requeueFailed(Long id, int attempt, AnalysisJobStatus failed, AnalysisJobStatus queued, Instant now);

    // 큐에 못 넣은 작업 — QUEUED 인데 넣었다는 표시가 없고 QUEUED 가 된 지 오래됐다
    List<AnalysisJob> findByStatusAndPublishedAtIsNullAndQueuedAtBeforeOrderByQueuedAtAsc(
            AnalysisJobStatus status, Instant queuedBefore, Limit limit);

    // 다시 걸 때가 된 실패 — 다시 걸지 않는 실패는 retry_at 이 비어 있어 읽히지 않는다(앞을 막지 않는다)
    List<AnalysisJob> findByStatusAndRetryAtLessThanEqualOrderByRetryAtAsc(
            AnalysisJobStatus status, Instant now, Limit limit);
}
