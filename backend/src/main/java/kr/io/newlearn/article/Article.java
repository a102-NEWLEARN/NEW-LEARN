package kr.io.newlearn.article;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import kr.io.newlearn.category.Category;
import kr.io.newlearn.press.Press;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

// 기사. 수집 배치가 적재하고(Jira 34), 투입(B1)하면 released_at 이 채워져 화면에 보인다 (data-model.md 2절)
// 기자명 · 대표 카테고리 · 태그 · 요약 · 투입 시각을 채우는 일은 수집 · 투입 티켓이 더한다
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Article {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    private ArticleSource source;

    private String url;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "press_code")
    private Press press;

    private String title;

    private String reporter;

    private String body;

    private Instant publishedAt;

    // 비어 있으면 대표 카테고리를 맞추지 못한 기사다
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_code")
    private Category category;

    // text[] 칸. Hibernate 7 은 List<String> 을 원래 배열로 다루지만 칸 타입이 보이게 적어 둔다
    // DB 기본값 '{}' 은 Hibernate 가 칸 값을 직접 넣어서 쓰이지 않으므로 빈 목록으로 시작한다
    @JdbcTypeCode(SqlTypes.ARRAY)
    private List<String> sourceCategories = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.ARRAY)
    private List<String> sourceTags;

    private String sourceSummary;

    private Instant releasedAt;

    @CreationTimestamp
    private Instant createdAt;

    public Article(
            ArticleSource source,
            String url,
            Press press,
            String title,
            String body,
            Instant publishedAt,
            List<String> sourceCategories) {
        this.source = source;
        this.url = url;
        this.press = press;
        this.title = title;
        this.body = body;
        this.publishedAt = publishedAt;
        this.sourceCategories = new ArrayList<>(sourceCategories);
    }
}
