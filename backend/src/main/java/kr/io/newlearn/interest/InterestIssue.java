package kr.io.newlearn.interest;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import java.time.Instant;
import kr.io.newlearn.issue.Issue;
import kr.io.newlearn.member.Member;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InterestIssue {
    @EmbeddedId
    private InterestIssueId id;

    @MapsId("memberId")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id")
    private Member member;

    @MapsId("issueId")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "issue_id")
    private Issue issue;

    @CreationTimestamp
    private Instant createdAt;

    public InterestIssue(Member member, Issue issue) {
        this.id = new InterestIssueId(member.getId(), issue.getId());
        this.member = member;
        this.issue = issue;
    }
}
