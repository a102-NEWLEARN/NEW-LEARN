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
// 상태는 QUEUED → SUCCEEDED · FAILED, 다시 돌리면 QUEUED 로 돌아온다 (api-internal.md 6절). 바꾸는 일은 아래 메서드로만 한다
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

    // jsonb 칸. MATCH_EVENT · ISSUE 에 보낸 후보를 JSON 글자 그대로 둔다. 모양을 정해 읽는 일은 Jira 35 · 40
    @JdbcTypeCode(SqlTypes.JSON)
    private String candidates;

    // jsonb 칸. MATCH_EVENT · ISSUE 판정 기록 { reason, model, promptVersion } — 쓰는 일은 Jira 35 · 40
    @JdbcTypeCode(SqlTypes.JSON)
    private String result;

    // 마지막 실패의 코드 · 설명. 성공하면 지운다
    private String errorCode;

    private String errorMessage;

    @CreationTimestamp
    private Instant createdAt;

    // 워커가 이번 시도를 시작 · 끝낸 때 (W1 의 startedAt · finishedAt)
    private Instant startedAt;

    private Instant finishedAt;

    // 이번 시도가 QUEUED 가 된 때, 큐에 넣은 때. published_at 이 비면 아직 못 넣었다 (Jira 30)
    private Instant queuedAt;

    private Instant publishedAt;

    public AnalysisJob(Article article, AnalysisStage stage, RequestedBy requestedBy, String candidates) {
        this.article = article;
        this.stage = stage;
        this.requestedBy = requestedBy;
        this.candidates = candidates;
        this.status = AnalysisJobStatus.QUEUED;
        this.attempt = 1;
        this.queuedAt = Instant.now();
    }

    // W1 SUCCEEDED — 단계별 결과는 처리기(AnalysisResultHandler)가 따로 저장한다
    public void succeed(Instant startedAt, Instant finishedAt) {
        this.status = AnalysisJobStatus.SUCCEEDED;
        this.startedAt = startedAt;
        this.finishedAt = finishedAt;
        this.errorCode = null;
        this.errorMessage = null;
    }

    // W1 FAILED, 또는 API 가 결과 저장을 거절했을 때(RESULT_SCHEMA_INVALID)
    public void fail(String errorCode, String errorMessage, Instant startedAt, Instant finishedAt) {
        this.status = AnalysisJobStatus.FAILED;
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
        this.startedAt = startedAt;
        this.finishedAt = finishedAt;
    }

    // 다시 돌리기 — 시도 번호를 올리고 다시 QUEUED. 큐에 넣는 일은 커밋 뒤에 한다(published_at 을 비운다)
    public void requeue(Instant now) {
        this.status = AnalysisJobStatus.QUEUED;
        this.attempt = attempt + 1;
        this.queuedAt = now;
        this.publishedAt = null;
    }

    public boolean isQueued() {
        return status == AnalysisJobStatus.QUEUED;
    }
}
