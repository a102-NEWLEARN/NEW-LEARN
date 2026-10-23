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
    private Issue issue;

    private String title;

    private String label;

    private String summary;

    private Instant occurredAt;

    @Enumerated(EnumType.STRING)
    private OccurredAtBasis occurredAtBasis;

    @CreationTimestamp
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    public Event(String title, String label, String summary, Instant occurredAt, OccurredAtBasis occurredAtBasis) {
        this.title = title;
        this.label = label;
        this.summary = summary;
        this.occurredAt = occurredAt;
        this.occurredAtBasis = occurredAtBasis;
    }
}
