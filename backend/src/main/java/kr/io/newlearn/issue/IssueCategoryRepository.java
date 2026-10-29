package kr.io.newlearn.issue;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface IssueCategoryRepository extends JpaRepository<IssueCategory, IssueCategoryId> {

    // ISSUE 가 이슈를 만들 때 · 사건을 붙일 때 다시 채운다(Jira 40) — 지우고 아래로 하나를 넣는다
    @Modifying(flushAutomatically = true)
    @Query(nativeQuery = true, value = "delete from issue_category where issue_id = :issueId")
    int clear(long issueId);

    // 이슈 기사들의 대표 카테고리 중 기사가 가장 많은 것 하나, 같으면 카테고리 순서(sort_order)가 앞선 것. 대표 카테고리가 없는
    // 기사는 셈에서 뺀다 — 모두 없으면 넣지 않는다 (data-model.md issue 절, 2026-10-29 사용자)
    @Modifying(flushAutomatically = true)
    @Query(nativeQuery = true, value = """
            insert into issue_category(issue_id, category_code)
            select :issueId, a.category_code from article a
            join article_event l on l.article_id = a.id
            join event e on e.id = l.event_id
            join category c on c.code = a.category_code
            where e.issue_id = :issueId
            group by a.category_code, c.sort_order
            order by count(*) desc, c.sort_order, a.category_code
            limit 1
            """)
    int fillMostCommon(long issueId);
}
