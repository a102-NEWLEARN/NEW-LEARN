package kr.io.newlearn.event;

import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ArticleEventRepository extends JpaRepository<ArticleEvent, Long> {
    @EntityGraph(attributePaths = {"event", "event.issue"})
    Optional<ArticleEvent> findByArticleId(Long articleId);
}
