package kr.io.newlearn.article;

import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ArticleRepository extends JpaRepository<Article, Long> {
    @EntityGraph(attributePaths = {"press", "category"})
    Page<Article> findByReleasedAtIsNotNull(Pageable pageable);

    @EntityGraph(attributePaths = {"press", "category"})
    Page<Article> findByReleasedAtIsNotNullAndCategory_Code(String category, Pageable pageable);

    @EntityGraph(attributePaths = {"press", "category"})
    Optional<Article> findByIdAndReleasedAtIsNotNull(Long id);

    @EntityGraph(attributePaths = {"press", "category"})
    @Query("""
            select a from Article a where a.releasedAt is not null and exists (
                select l.articleId from ArticleEvent l where l.article = a and l.event.id = :eventId)
            """)
    Page<Article> findReleasedByEventId(Long eventId, Pageable pageable);
}
