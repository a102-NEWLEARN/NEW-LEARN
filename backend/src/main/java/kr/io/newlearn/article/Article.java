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
import org.jspecify.annotations.Nullable;

// 기사. 수집 배치가 적재(B2, Jira 153)하고 투입(B1)하면 분석이 걸린다. 화면에 보이는 때(released_at)는 EXTRACT 결과를 처음
// 저장할 때 markReleased 가 채운다 (data-model.md 2절, Jira 34)
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

    private @Nullable String reporter;

    private String body;

    private Instant publishedAt;

    // 비어 있으면 대표 카테고리를 맞추지 못한 기사다
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_code")
    private @Nullable Category category;

    // text[] 칸. Hibernate 7 은 List<String> 을 원래 배열로 다루지만 칸 타입이 보이게 적어 둔다
    // DB 기본값 '{}' 은 Hibernate 가 칸 값을 직접 넣어서 쓰이지 않으므로 빈 목록으로 시작한다
    @JdbcTypeCode(SqlTypes.ARRAY)
    private List<String> sourceCategories = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.ARRAY)
    private @Nullable List<String> sourceTags;

    private @Nullable Instant releasedAt;

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

    // 적재할 때 원본에서 온 선택 칸을 채운다 — 기자명 · 대표 카테고리(category_mapping 으로 고름) · 태그(NewsData ai_tag) (Jira 153)
    public void fillSourceDetails(
            @Nullable String reporter, @Nullable Category category, @Nullable List<String> sourceTags) {
        this.reporter = reporter;
        this.category = category;
        this.sourceTags = sourceTags == null ? null : new ArrayList<>(sourceTags);
    }

    // 화면에 내놓는다 — EXTRACT 결과를 처음 저장할 때 부른다(분석이 끝난 뒤부터 보인다, 2026-10-26 Jira 34)
    // 이미 공개했으면 그대로 둔다. 다시 분석해도 처음 공개 시각이 남는다
    public void markReleased(Instant now) {
        if (releasedAt == null) {
            this.releasedAt = now;
        }
    }
}
