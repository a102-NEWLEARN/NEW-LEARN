package kr.io.newlearn.bookmark;

import jakarta.persistence.Embeddable;
import java.io.Serial;
import java.io.Serializable;
import lombok.AccessLevel;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Embeddable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EqualsAndHashCode
public class BookmarkId implements Serializable {
    @Serial
    private static final long serialVersionUID = 1L;

    private Long memberId;
    private Long articleId;

    public BookmarkId(Long memberId, Long articleId) {
        this.memberId = memberId;
        this.articleId = articleId;
    }
}
