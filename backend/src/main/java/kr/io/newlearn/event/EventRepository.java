package kr.io.newlearn.event;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import kr.io.newlearn.common.PublicEventSql;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface EventRepository extends JpaRepository<Event, Long> {
    // A4 타임라인 — 공개 기사가 있는 사건만, 발생 시점 · ID 오름차순(docs/api.md 1절, Jira 179)
    @Query("select e from Event e where e.issue.id = :issueId and " + PublicEventSql.JPQL_EVENT_HAS_PUBLIC_ARTICLE
            + " order by e.occurredAt asc, e.id asc")
    List<Event> findPublicByIssueId(Long issueId);

    @EntityGraph(attributePaths = "issue")
    Optional<Event> findWithIssueById(Long id);

    // 시각이 같은 사건도 ID로 가른다. A4와 같은 순서(공개 기사가 있는 사건만)에서 인접한 한 건만 읽는다.
    @Query("""
            select e from Event e where e.issue.id = :issueId
            and (e.occurredAt < :occurredAt or (e.occurredAt = :occurredAt and e.id < :id))
            """ + " and " + PublicEventSql.JPQL_EVENT_HAS_PUBLIC_ARTICLE + """
            order by e.occurredAt desc, e.id desc
            """)
    List<Event> findPrevious(Long issueId, Instant occurredAt, Long id, Pageable pageable);

    @Query("""
            select e from Event e where e.issue.id = :issueId
            and (e.occurredAt > :occurredAt or (e.occurredAt = :occurredAt and e.id > :id))
            """ + " and " + PublicEventSql.JPQL_EVENT_HAS_PUBLIC_ARTICLE + """
            order by e.occurredAt asc, e.id asc
            """)
    List<Event> findNext(Long issueId, Instant occurredAt, Long id, Pageable pageable);

    // 판정(EXISTING)이 더 이른 기사를 붙이면 발행 시각으로 채운 시점(FIRST_PUBLISHED)을 그 발행 시각으로 당긴다
    // (Jira 35, data-model.md event 「다시 계산한다」). 엔티티를 고쳐 저장하면 모든 칸을 다시 써서, 그사이 이슈 붙이기(Jira 40)가
    // 바꾼 issue_id 를 옛 값으로 덮을 수 있다 — 바꿀 칸만 조건부로 고친다.
    // clearAutomatically 를 쓰지 않는다 — W1 이 잠근 작업 엔티티가 떨어져 나가면 성공 표시가 저장되지 않는다
    @Modifying(flushAutomatically = true)
    @Query("""
            update Event e set e.occurredAt = :publishedAt, e.updatedAt = :now
            where e.id = :id and e.occurredAtBasis = :basis and e.occurredAt > :publishedAt
            """)
    int pullOccurredAt(Long id, Instant publishedAt, OccurredAtBasis basis, Instant now);

    // ISSUE ATTACH · CREATE — 아직 이슈 밖인 사건만 이슈에 넣는다(Jira 40, api-internal.md 5절). 확인과 바꾸기가 한 문장이라
    // 돌려받은 수가 보낸 사건 수보다 작으면 그사이 다른 이슈에 들어간 사건이 있다 — 부른 쪽이 되돌린다.
    // pullOccurredAt 처럼 바꿀 칸만 고치고 clearAutomatically 를 쓰지 않는다
    @Modifying(flushAutomatically = true)
    @Query(nativeQuery = true, value = """
            update event set issue_id = :issueId, updated_at = :now
            where id in (:eventIds) and issue_id is null
            """)
    int assignIssue(long issueId, Collection<Long> eventIds, Instant now);
}
