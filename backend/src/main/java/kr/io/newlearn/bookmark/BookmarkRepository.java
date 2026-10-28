package kr.io.newlearn.bookmark;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface BookmarkRepository extends JpaRepository<Bookmark, BookmarkId> {
    @Modifying
    @Query(value = """
            insert into bookmark(member_id, article_id) values (:memberId, :articleId)
            on conflict (member_id, article_id) do nothing
            """, nativeQuery = true)
    int insertIfAbsent(long memberId, long articleId);

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
