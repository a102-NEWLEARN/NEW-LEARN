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
// 다시 분석하면 덮어쓰는 메서드는 마인드맵 저장 티켓(Jira 56)이 더한다
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

    // jsonb 칸. 가지 4개와 잎을 JSON 글자 그대로 둔다 (docs/api-screen.md 3절). 모양을 정해 읽는 일은 Jira 56
    @JdbcTypeCode(SqlTypes.JSON)
    private String content;

    private @Nullable Instant occurredAt;

    private String schemaVersion;

    private String model;

    private String promptVersion;

    private Instant generatedAt;

    public ArticleMindmap(
            Article article,
            @Nullable String summary,
            String content,
            @Nullable Instant occurredAt,
            String schemaVersion,
            String model,
            String promptVersion,
            Instant generatedAt) {
        this.article = article;
        this.summary = summary;
        this.content = content;
        this.occurredAt = occurredAt;
        this.schemaVersion = schemaVersion;
        this.model = model;
        this.promptVersion = promptVersion;
        this.generatedAt = generatedAt;
    }
}
