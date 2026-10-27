package kr.io.newlearn.issue;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.jspecify.annotations.Nullable;

// 이슈. 사건 3개가 모이면 ISSUE 단계가 만들고, 이름은 그때 한 번 짓는다 (data-model.md 2절)
// 요약은 AI 가 만들다 실패하면 비어 있을 수 있다
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Issue {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String title;

    private @Nullable String summary;

    @CreationTimestamp
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    public Issue(String title, @Nullable String summary) {
        this.title = title;
        this.summary = summary;
    }
}
