package kr.io.newlearn.event;

import java.util.List;
import java.util.Optional;
import kr.io.newlearn.press.Press;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ArticleEventRepository extends JpaRepository<ArticleEvent, Long> {
    @EntityGraph(attributePaths = {"event", "event.issue"})
    Optional<ArticleEvent> findByArticleId(Long articleId);

    @Query("select count(l) from ArticleEvent l where l.event.id = :eventId and l.article.releasedAt is not null")
    long countReleasedArticles(Long eventId);

    @Query("""
            select distinct p from ArticleEvent l join l.article a join a.press p
            where l.event.id = :eventId and a.releasedAt is not null order by p.code
            """)
    List<Press> findReleasedPublishers(Long eventId);
}
