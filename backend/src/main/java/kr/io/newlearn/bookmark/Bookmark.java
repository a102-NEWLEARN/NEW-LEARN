package kr.io.newlearn.bookmark;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import java.time.Instant;
import kr.io.newlearn.article.Article;
import kr.io.newlearn.member.Member;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Bookmark {
    @EmbeddedId
    private BookmarkId id;

    @MapsId("memberId")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id")
    private Member member;

    @MapsId("articleId")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "article_id")
    private Article article;

    @CreationTimestamp
    private Instant createdAt;

    public Bookmark(Member member, Article article) {
        this.id = new BookmarkId(member.getId(), article.getId());
        this.member = member;
        this.article = article;
    }
}
