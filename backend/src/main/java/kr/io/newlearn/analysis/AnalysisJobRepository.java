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

    // B1 — 이미 투입한 기사인가(분석 작업이 하나라도 있다)
    boolean existsByArticle_Id(Long articleId);

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

    // 큐에 못 넣은 작업 — QUEUED 인데 넣었다는 표시가 없고 QUEUED 가 된 지 오래됐다.
    // 넣을 작업만 읽는다 — 메시지를 만들 수 있는 단계이고, ISSUE 면 고르기가 후보를 남긴 작업이다. 후보가 빈 ISSUE 대기 작업은
    // 고르기(IssueDispatcher)만 넣는다. 넣지 않을 작업이 한 번에 읽는 수를 채우면 다른 단계가 막힌다 (Jira 35 · 40)
    @Query("""
            select j from AnalysisJob j
            where j.status = :status and j.publishedAt is null and j.queuedAt < :queuedBefore and j.stage in :stages
              and (j.stage <> :picked or j.candidates is not null)
            order by j.queuedAt
            """)
    List<AnalysisJob> findUnpublished(
            AnalysisJobStatus status,
            Instant queuedBefore,
            Collection<AnalysisStage> stages,
            AnalysisStage picked,
            Limit limit);

    // 다시 걸 때가 된 실패 — 다시 걸지 않는 실패는 retry_at 이 비어 있어 읽히지 않는다(앞을 막지 않는다)
    List<AnalysisJob> findByStatusAndRetryAtLessThanEqualOrderByRetryAtAsc(
            AnalysisJobStatus status, Instant now, Limit limit);

    // 판정 고르기(MatchDispatcher, Jira 35) — 진행 중인 판정 작업. QUEUED, 또는 실패했는데 다시 걸 예정이면 진행 중이다.
    // 다시 걸지 않는 실패(retry_at 이 빔)는 진행 중이 아니다 — 뒤 기사를 막지 않는다
    @Query(nativeQuery = true, value = """
            select id from analysis_job
            where stage = 'MATCH_EVENT' and (status = 'QUEUED' or (status = 'FAILED' and retry_at is not null))
            order by id limit 1
            """)
    Optional<Long> findMatchInFlight();

    // 판정 고르기 — 판정할 기사 중 발행 시각이 가장 이른 것. EXTRACT · EMBED 가 둘 다 성공했고, 대표 사건이 있고,
    // 판정 작업이 아직 없고, 사건에 안 묶인 기사다. 후보를 재려면 벡터가 있어야 해서 벡터 행도 본다
    @Query(nativeQuery = true, value = """
            select a.id from article a
            join article_mindmap m on m.article_id = a.id and m.primary_core_index is not null
            join article_embedding e on e.article_id = a.id
            where exists (select 1 from analysis_job j
                          where j.article_id = a.id and j.stage = 'EXTRACT' and j.status = 'SUCCEEDED')
              and exists (select 1 from analysis_job j
                          where j.article_id = a.id and j.stage = 'EMBED' and j.status = 'SUCCEEDED')
              and not exists (select 1 from analysis_job j where j.article_id = a.id and j.stage = 'MATCH_EVENT')
              and not exists (select 1 from article_event l where l.article_id = a.id)
            order by a.published_at, a.id
            limit 1
            """)
    Optional<Long> findNextMatchArticle();

    // ISSUE 고르기(IssueDispatcher, Jira 40) — 진행 중인 ISSUE 작업. 후보가 있는 QUEUED, 또는 실패했는데 다시 걸 예정이면 진행 중이다.
    // 후보가 빈 QUEUED 는 아직 고르지 않은 대기 작업이고, 다시 걸지 않는 실패도 진행 중이 아니다
    @Query(nativeQuery = true, value = """
            select id from analysis_job
            where stage = 'ISSUE'
              and ((status = 'QUEUED' and candidates is not null) or (status = 'FAILED' and retry_at is not null))
            order by id limit 1
            """)
    Optional<Long> findIssueInFlight();

    // ISSUE 고르기 — 대기 작업 중 작업 번호가 가장 작은 것. 판정 NEW 가 사건과 같이 만들어서 사건이 생긴 순서다.
    // 다시 거는 작업도 후보를 비워 여기로 돌아온다 — 앞 작업은 모두 끝났으니 번호가 가장 작아 맨 앞이다
    @Query(nativeQuery = true, value = """
            select id from analysis_job
            where stage = 'ISSUE' and status = 'QUEUED' and candidates is null
            order by id limit 1
            """)
    Optional<Long> findNextWaitingIssue();
}
