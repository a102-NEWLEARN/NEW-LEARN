package kr.io.newlearn.interest;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface InterestIssueRepository extends JpaRepository<InterestIssue, InterestIssueId> {
    // 같은 문장에서 존재하는 이슈만 선택한다. 충돌하면 갱신하지 않아 최초 저장 시각을 유지한다.
    @Modifying
    @Query(value = """
            insert into interest_issue(member_id, issue_id)
            select :memberId, i.id from issue i where i.id = :issueId
            on conflict (member_id, issue_id) do nothing
            """, nativeQuery = true)
    int insertIfAbsent(long memberId, long issueId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from InterestIssue i where i.id.memberId = :memberId and i.id.issueId = :issueId")
    int remove(long memberId, long issueId);

    @Query("select i.id.issueId from InterestIssue i where i.id.memberId = :memberId and i.id.issueId in :issueIds")
    List<Long> findIssueIds(long memberId, List<Long> issueIds);

    @Query("select i from InterestIssue i where i.id.memberId = :memberId order by i.createdAt desc, i.id.issueId desc")
    List<InterestIssue> findSavedByMemberId(long memberId);
}
