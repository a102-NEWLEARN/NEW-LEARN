package kr.io.newlearn.mindmap;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import java.time.Instant;
import kr.io.newlearn.article.Article;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.jspecify.annotations.Nullable;

// 기사 하나의 마인드맵 결과(W1 의 EXTRACT 결과). 기사 하나에 결과 하나라 기본 키가 기사 키다 (data-model.md 2절)
// 다시 분석해 성공하면 replaceWith 로 덮어쓴다. 실패하면 옛 결과를 그대로 둔다 (Jira 56)
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ArticleMindmap {

    @Id
    private Long articleId;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "article_id")
    private Article article;

    private @Nullable String summary;

    // jsonb 칸. 가지 4개와 잎을 JSON 글자 그대로 둔다. 모양은 MindmapContent (docs/api-screen.md 3절)
    @JdbcTypeCode(SqlTypes.JSON)
    private String content;

    // 대표 사건 — content 의 CORE 가지 잎 번호(0부터). 비면 특정 사건이 없는 기사 (V5)
    private @Nullable Integer primaryCoreIndex;

    private @Nullable Instant occurredAt;

    private String schemaVersion;

    private String model;

    private String promptVersion;

    private Instant generatedAt;

    public ArticleMindmap(
            Article article,
            @Nullable String summary,
            String content,
            @Nullable Integer primaryCoreIndex,
            @Nullable Instant occurredAt,
            String schemaVersion,
            String model,
            String promptVersion,
            Instant generatedAt) {
        // 칸을 replaceWith 에 맡기지 않고 여기서 채운다 — NullAway 는 생성자가 부른 메서드 안까지 따라가 보지 않는다
        this.article = article;
        this.summary = summary;
        this.content = content;
        this.primaryCoreIndex = primaryCoreIndex;
        this.occurredAt = occurredAt;
        this.schemaVersion = schemaVersion;
        this.model = model;
        this.promptVersion = promptVersion;
        this.generatedAt = generatedAt;
    }

    // 기사(키)만 그대로 두고 결과 칸을 모두 바꾼다 — 새 결과에 없는 칸(대표 사건 · 시점)도 비운다
    public void replaceWith(
            @Nullable String summary,
            String content,
            @Nullable Integer primaryCoreIndex,
            @Nullable Instant occurredAt,
            String schemaVersion,
            String model,
            String promptVersion,
            Instant generatedAt) {
        this.summary = summary;
        this.content = content;
        this.primaryCoreIndex = primaryCoreIndex;
        this.occurredAt = occurredAt;
        this.schemaVersion = schemaVersion;
        this.model = model;
        this.promptVersion = promptVersion;
        this.generatedAt = generatedAt;
    }
}
