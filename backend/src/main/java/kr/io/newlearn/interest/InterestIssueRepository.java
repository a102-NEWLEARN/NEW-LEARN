package kr.io.newlearn.interest;

import java.util.List;
import java.util.Optional;
import kr.io.newlearn.common.PublicEventSql;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface InterestIssueRepository extends JpaRepository<InterestIssue, InterestIssueId> {
    // 이슈가 있는지 보기 · 넣기 · 저장 시각 읽기를 한 문장으로 — 사이에 해제가 끼어들 틈이 없다(BookmarkRepository.add 와 같음).
    // 이미 있으면 같은 시각으로 갱신해 행을 잠그고 그 행을 돌려받는다(최초 저장 시각 유지). 없는 이슈 · 공개 기사가 없는 이슈면 돌려받는 행이 없다
    @Query(value = """
            insert into interest_issue(member_id, issue_id)
            select :memberId, i.id from issue i where i.id = :issueId and
            """ + PublicEventSql.ISSUE_HAS_PUBLIC_ARTICLE + """
            on conflict (member_id, issue_id) do update set created_at = interest_issue.created_at
            returning member_id, issue_id, created_at
            """, nativeQuery = true)
    Optional<InterestIssue> add(long memberId, long issueId, int publicArticleSkip);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from InterestIssue i where i.id.memberId = :memberId and i.id.issueId = :issueId")
    int remove(long memberId, long issueId);

    @Query("select i.id.issueId from InterestIssue i where i.id.memberId = :memberId and i.id.issueId in :issueIds")
    List<Long> findIssueIds(long memberId, List<Long> issueIds);

    @Query("select i from InterestIssue i where i.id.memberId = :memberId order by i.createdAt desc, i.id.issueId desc")
    List<InterestIssue> findSavedByMemberId(long memberId);
}
