package kr.io.newlearn.event;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
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
}
