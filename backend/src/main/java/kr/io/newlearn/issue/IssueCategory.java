package kr.io.newlearn.issue;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import kr.io.newlearn.category.Category;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 이슈가 걸친 카테고리. 이슈 기사들의 대표 카테고리로 API 가 채운다(가정, data-model.md 5절 2번)
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class IssueCategory {

    @EmbeddedId
    private IssueCategoryId id;

    @MapsId("issueId")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "issue_id")
    private Issue issue;

    @MapsId("categoryCode")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_code")
    private Category category;

    public IssueCategory(Issue issue, Category category) {
        this.id = new IssueCategoryId(issue.getId(), category.getCode());
        this.issue = issue;
        this.category = category;
    }
}
