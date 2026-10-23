package kr.io.newlearn.event;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import java.time.Instant;
import kr.io.newlearn.article.Article;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

// 기사가 속한 사건. 기본 키가 기사 키라 기사 하나는 사건 하나에만 속한다 (PRD FR-9 가정, data-model.md 5절 1번)
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ArticleEvent {

    // 값은 @MapsId 가 article 에서 채운다. 생성자에서 직접 넣으면 save() 가 새 행이 아닌 줄 알고 merge 로 돈다
    @Id
    private Long articleId;

    // 기사 쪽에는 반대 방향 연관을 두지 않는다. 두면 기사를 읽을 때 지연 로딩이 듣지 않는다
    @MapsId
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "article_id")
    private Article article;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_id")
    private Event event;

    // 동일 사건 판정이 붙인 시각 = 이 행을 만든 시각
    @CreationTimestamp
    private Instant linkedAt;

    public ArticleEvent(Article article, Event event) {
        this.article = article;
        this.event = event;
    }
}
