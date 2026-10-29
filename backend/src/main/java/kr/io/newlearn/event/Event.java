package kr.io.newlearn.event;

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
import kr.io.newlearn.issue.Issue;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.jspecify.annotations.Nullable;

// 사건. 동일 사건 판정(MATCH_EVENT)이 새 사건이라고 하면 이름 · 키워드 · 요약과 함께 만든다 (data-model.md 2절)
// 처음엔 이슈 밖에 있고(issue 가 비어 있음), ISSUE 단계가 이슈에 붙인다
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Event {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // LAZY: 사건을 읽을 때 이슈까지 같이 읽지 않고, getIssue() 로 이슈 칸을 처음 쓸 때 읽는다
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "issue_id")
    private @Nullable Issue issue;

    private String title;

    private String label;

    private @Nullable String summary;

    private Instant occurredAt;

    @Enumerated(EnumType.STRING)
    private OccurredAtBasis occurredAtBasis;

    // 타임라인 레인을 정한다(MAIN → 메인 흐름, REACTION → 서브 흐름). 이름 · 키워드처럼 처음 지은 그대로 둔다 (Jira 130)
    @Enumerated(EnumType.STRING)
    private EventRole role;

    // REACTION 이면 무엇에 대한 반응인지 한 줄. 저장만 하고 화면 API 로는 내보내지 않는다
    private @Nullable String reactsTo;

    // REACTION 이면 반응하는 사건 — 판정에 보낸 후보 안일 때만 채운다. A4 이슈 타임라인이 같은 이슈의 사건일 때만 내보낸다 (Jira 134)
    // 사건을 읽을 때 대상 사건까지 읽지 않게 번호로만 둔다
    private @Nullable Long reactsToEventId;

    @CreationTimestamp
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    public Event(
            String title,
            String label,
            @Nullable String summary,
            Instant occurredAt,
            OccurredAtBasis occurredAtBasis,
            EventRole role,
            @Nullable String reactsTo,
            @Nullable Long reactsToEventId) {
        this.title = title;
        this.label = label;
        this.summary = summary;
        this.occurredAt = occurredAt;
        this.occurredAtBasis = occurredAtBasis;
        this.role = role;
        this.reactsTo = reactsTo;
        this.reactsToEventId = reactsToEventId;
    }
}
