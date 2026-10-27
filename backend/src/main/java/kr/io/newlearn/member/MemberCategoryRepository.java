package kr.io.newlearn.member;

import java.util.List;
import kr.io.newlearn.category.Category;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface MemberCategoryRepository extends JpaRepository<MemberCategory, MemberCategoryId> {
    // 회원의 관심 분야를 카테고리 탭 순서로 — 회원 정보 응답(A14 · A15 · A17)이 쓴다
    @Query("select mc.category from MemberCategory mc where mc.member.id = :memberId order by mc.category.sortOrder")
    List<Category> findCategoriesOfMember(long memberId);

    // bulk 삭제 뒤 같은 복합 키를 다시 넣을 수 있으므로 JPA 문맥에 옛 연결을 남기지 않는다.
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from MemberCategory mc where mc.member.id = :memberId")
    void deleteForMember(long memberId);
}
