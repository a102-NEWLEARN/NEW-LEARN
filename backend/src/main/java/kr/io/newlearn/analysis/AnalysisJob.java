package kr.io.newlearn.analysis;

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
import kr.io.newlearn.article.Article;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

// 분석 작업. 기사 하나 · 단계 하나에 한 행이고, 다시 돌리면 같은 행의 attempt 를 올린다 (data-model.md 2절)
// 결과 받기 · 다시 돌리기는 큐 · W1 티켓(Jira 30)이 메서드를 더한다
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AnalysisJob {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "article_id")
    private Article article;

    @Enumerated(EnumType.STRING)
    private AnalysisStage stage;

    @Enumerated(EnumType.STRING)
    private AnalysisJobStatus status;

    @Enumerated(EnumType.STRING)
    private RequestedBy requestedBy;

    private int attempt;

    // jsonb 칸. MATCH_EVENT · ISSUE 에 보낸 후보를 JSON 글자 그대로 둔다. 모양을 정해 읽는 일은 Jira 30 · 35 · 40
    @JdbcTypeCode(SqlTypes.JSON)
    private String candidates;

    private String errorCode;

    private String errorMessage;

    @CreationTimestamp
    private Instant createdAt;

    private Instant startedAt;

    private Instant finishedAt;

    public AnalysisJob(Article article, AnalysisStage stage, RequestedBy requestedBy, String candidates) {
        this.article = article;
        this.stage = stage;
        this.requestedBy = requestedBy;
        this.candidates = candidates;
        this.status = AnalysisJobStatus.QUEUED;
        this.attempt = 1;
    }
}
