package kr.io.newlearn.issue;

import jakarta.persistence.Embeddable;
import java.io.Serial;
import java.io.Serializable;
import lombok.AccessLevel;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

// issue_category 의 기본 키 (issue_id, category_code)
@Embeddable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EqualsAndHashCode
public class IssueCategoryId implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private Long issueId;

    private String categoryCode;

    public IssueCategoryId(Long issueId, String categoryCode) {
        this.issueId = issueId;
        this.categoryCode = categoryCode;
    }
}
