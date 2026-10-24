package kr.io.newlearn.event;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventRepository extends JpaRepository<Event, Long> {
    List<Event> findByIssue_IdOrderByOccurredAtAscIdAsc(Long issueId);
}
