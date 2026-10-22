package kr.io.newlearn.member;

import jakarta.persistence.Embeddable;
import java.io.Serializable;
import lombok.AccessLevel;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

// member_category 의 기본 키 (member_id, category_code). 두 칸을 합쳐야 한 행을 가리킨다
// JPA 는 키가 같은지를 equals · hashCode 로 판단하므로 두 칸 값으로 비교하게 둔다
@Embeddable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EqualsAndHashCode
public class MemberCategoryId implements Serializable {

    private Long memberId;

    private String categoryCode;

    public MemberCategoryId(Long memberId, String categoryCode) {
        this.memberId = memberId;
        this.categoryCode = categoryCode;
    }
}
