package kr.io.newlearn.event;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface EventRepository extends JpaRepository<Event, Long> {
    List<Event> findByIssue_IdOrderByOccurredAtAscIdAsc(Long issueId);

    @EntityGraph(attributePaths = "issue")
    Optional<Event> findWithIssueById(Long id);

    // 시각이 같은 사건도 ID로 가른다. A4와 같은 순서에서 인접한 한 건만 읽는다.
    @Query("""
            select e from Event e where e.issue.id = :issueId
            and (e.occurredAt < :occurredAt or (e.occurredAt = :occurredAt and e.id < :id))
            order by e.occurredAt desc, e.id desc
            """)
    List<Event> findPrevious(Long issueId, Instant occurredAt, Long id, Pageable pageable);

    @Query("""
            select e from Event e where e.issue.id = :issueId
            and (e.occurredAt > :occurredAt or (e.occurredAt = :occurredAt and e.id > :id))
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
}
