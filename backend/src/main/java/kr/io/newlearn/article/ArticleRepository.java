package kr.io.newlearn.article;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.NotFoundException;
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

    // 기사 상세 · 마인드맵 · 북마크 넣기가 같이 쓴다 — 없거나 공개 전 기사는 같은 404 (docs/api.md 1절)
    default Article getReleased(long articleId) {
        return findByIdAndReleasedAtIsNotNull(articleId)
                .orElseThrow(() -> new NotFoundException(ErrorCode.ARTICLE_NOT_FOUND, "기사를 찾을 수 없다: " + articleId));
    }

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
