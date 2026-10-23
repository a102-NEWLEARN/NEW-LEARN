package kr.io.newlearn.member;

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

// 회원의 관심 분야. 가입 때 1개 이상 고르고, 바꿀 때는 그 회원의 행을 통째로 바꾼다 (A18, Jira 65)
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MemberCategory {

    @EmbeddedId
    private MemberCategoryId id;

    // @MapsId: 키의 memberId 칸을 이 연관의 member_id 로 채운다. 같은 칸을 키와 외래 키가 함께 쓴다
    @MapsId("memberId")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id")
    private Member member;

    @MapsId("categoryCode")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_code")
    private Category category;

    public MemberCategory(Member member, Category category) {
        this.id = new MemberCategoryId(member.getId(), category.getCode());
        this.member = member;
        this.category = category;
    }
}
