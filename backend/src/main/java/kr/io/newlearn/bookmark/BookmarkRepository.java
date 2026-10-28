package kr.io.newlearn.bookmark;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface BookmarkRepository extends JpaRepository<Bookmark, BookmarkId> {
    // 담기 — 처음이면 넣고, 이미 있으면 그 행을 잠근 채 담은 시각을 그대로 두고 돌려준다(한 문장).
    // 「넣기(충돌이면 무시) → 다시 읽기」 두 문장이면 그 사이에 같은 기사의 빼기가 끼어 커밋될 때 다시 읽기가 빈 값을 받는다.
    // do update 는 충돌한 행을 잠그므로 동시에 담아도 먼저 들어온 시각이 남는다(BookmarkConcurrencyIntegrationTest)
    @Query(value = """
            insert into bookmark(member_id, article_id) values (:memberId, :articleId)
            on conflict (member_id, article_id) do update set created_at = bookmark.created_at
            returning member_id, article_id, created_at
            """, nativeQuery = true)
    Bookmark add(long memberId, long articleId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from Bookmark b where b.id.memberId = :memberId and b.id.articleId = :articleId")
    int remove(long memberId, long articleId);

    @Query("select b.id.articleId from Bookmark b where b.id.memberId = :memberId and b.id.articleId in :articleIds")
    List<Long> findArticleIds(long memberId, List<Long> articleIds);

    @Query("""
            select b from Bookmark b join fetch b.article a join fetch a.press left join fetch a.category
            where b.id.memberId = :memberId and a.releasedAt is not null
            order by b.createdAt desc, a.id desc
            """)
    List<Bookmark> findReleasedByMemberId(long memberId);
}
