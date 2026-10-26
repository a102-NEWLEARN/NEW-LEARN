package kr.io.newlearn.article;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface ArticleRepository extends JpaRepository<Article, Long> {
    @EntityGraph(attributePaths = {"press", "category"})
    Page<Article> findByReleasedAtIsNotNull(Pageable pageable);

    @EntityGraph(attributePaths = {"press", "category"})
    Page<Article> findByReleasedAtIsNotNullAndCategory_Code(String category, Pageable pageable);

    @EntityGraph(attributePaths = {"press", "category"})
    Optional<Article> findByIdAndReleasedAtIsNotNull(Long id);

    // B1 투입 — 같은 기사 투입 둘이 동시에 와도 하나씩 보게 행을 잠그고 읽는다(공개 전 기사도 찾는다)
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Article a where a.id = :id")
    Optional<Article> findForUpdate(Long id);

    @EntityGraph(attributePaths = {"press", "category"})
    @Query("""
            select a from Article a where a.releasedAt is not null and exists (
                select l.articleId from ArticleEvent l where l.article = a and l.event.id = :eventId)
            """)
    Page<Article> findReleasedByEventId(Long eventId, Pageable pageable);
}
