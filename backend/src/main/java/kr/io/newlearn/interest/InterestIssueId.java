package kr.io.newlearn.interest;

import jakarta.persistence.Embeddable;
import java.io.Serial;
import java.io.Serializable;
import lombok.AccessLevel;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Embeddable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EqualsAndHashCode
public class InterestIssueId implements Serializable {
    @Serial
    private static final long serialVersionUID = 1L;

    private Long memberId;
    private Long issueId;

    public InterestIssueId(Long memberId, Long issueId) {
        this.memberId = memberId;
        this.issueId = issueId;
    }
}
