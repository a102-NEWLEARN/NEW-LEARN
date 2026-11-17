package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import kr.io.newlearn.category.CategoryQueryRepository;
import kr.io.newlearn.category.CategoryRepository;
import kr.io.newlearn.common.PublicEventThreshold;
import kr.io.newlearn.issue.IssueQueryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.simple.JdbcClient;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({
    TestcontainersConfiguration.class,
    CategoryQueryRepository.class,
    IssueQueryRepository.class,
    PublicEventThreshold.class
})
class CategoryIssueQueryTest {
    @Autowired
    JdbcClient jdbc;

    @Autowired
    CategoryRepository categories;

    @Autowired
    CategoryQueryRepository categoryQueries;

    @Autowired
    IssueQueryRepository issues;

    @BeforeEach
    void fixtures() {
        CategoryIssueFixtures.insert(jdbc);
    }

    @Test
    void categoryCountsAndOrder() {
        assertThat(categories.findAllByOrderBySortOrderAsc())
                .extracting(c -> c.getCode())
                .containsExactly("politics", "economy", "society", "world", "it_science");
        assertThat(categoryQueries.issueCounts()).containsEntry("politics", 2L).containsEntry("economy", 1L);
        assertThat(categoryQueries.articleCounts())
                .containsEntry("politics", 2L)
                .doesNotContainKey("economy");
    }

    @Test
    void aggregateCountsAndBulkReferences() {
        var page = issues.findCards(null, "lastEventAt", PageRequest.of(0, 2));
        assertThat(page.getTotalElements()).isEqualTo(3);
        assertThat(page.getContent())
                .extracting(IssueQueryRepository.CardRow::id)
                .containsExactly(4102L, 4101L);
        var card = page.getContent().getFirst();
        assertThat(card.eventCount()).isEqualTo(3);
        assertThat(card.articleCount()).isEqualTo(4);
        assertThat(card.publisherCount()).isEqualTo(1);
        assertThat(issues.findCategories(List.of(4102L)))
                .extracting(IssueQueryRepository.CategoryRow::code)
                .containsExactly("politics", "economy");
        assertThat(issues.findLastEvents(List.of(4102L)))
                .extracting(IssueQueryRepository.EventRow::id)
                .containsExactly(4123L);
    }

    @Test
    void createdTiesFilterAndEmptyPageKeepTotal() {
        assertThat(issues.findCards(null, "createdAt", PageRequest.of(0, 3)).getContent())
                .extracting(IssueQueryRepository.CardRow::id)
                .containsExactly(4103L, 4102L, 4101L);
        assertThat(issues.findCards("politics", "lastEventAt", PageRequest.of(0, 20))
                        .getTotalElements())
                .isEqualTo(2);
        assertThat(issues.findCards("it_science", "lastEventAt", PageRequest.of(0, 20)))
                .isEmpty();
        var empty = issues.findCards(null, "lastEventAt", PageRequest.of(100, 1));
        assertThat(empty).isEmpty();
        assertThat(empty.getTotalElements()).isEqualTo(3);
        // 끝을 넘은 쪽은 행이 없어 목록 질의가 전체 수를 못 준다 — 따로 세는 질의도 같은 분야로 세야 한다(Jira 227)
        var politicsEmpty = issues.findCards("politics", "lastEventAt", PageRequest.of(5, 1));
        assertThat(politicsEmpty).isEmpty();
        assertThat(politicsEmpty.getTotalElements()).isEqualTo(2);
        assertThat(issues.findCategories(List.of())).isEmpty();
        assertThat(issues.findLastEvents(List.of())).isEmpty();
    }

    // 분야를 고른 목록은 개수(total)만이 아니라 카드 자체도 그 분야 이슈만, 같은 수로 나온다 — 목록 SQL 의 분야 조건이
    // 사건 쪽(e.issue_id)에서 걸리므로 그 조건이 틀리면 여기서 드러난다(Jira 194)
    @Test
    void categoryFilteredCardsKeepOnlyThatCategoryWithSameCounts() {
        assertThat(issues.findCards("politics", "lastEventAt", PageRequest.of(0, 20))
                        .getContent())
                .extracting(IssueQueryRepository.CardRow::id)
                .containsExactly(4102L, 4101L);
        var economy = issues.findCards("economy", "lastEventAt", PageRequest.of(0, 20))
                .getContent();
        assertThat(economy).extracting(IssueQueryRepository.CardRow::id).containsExactly(4102L);
        assertThat(economy.getFirst().eventCount()).isEqualTo(3);
        assertThat(economy.getFirst().articleCount()).isEqualTo(4);
        assertThat(economy.getFirst().publisherCount()).isEqualTo(1);
        assertThat(issues.findCards("world", "createdAt", PageRequest.of(0, 20)).getContent())
                .extracting(IssueQueryRepository.CardRow::id)
                .containsExactly(4103L);
    }

    // 이슈 밖 사건(issue_id 가 빈)에도 공개 기사가 붙는다 — 운영 11-12 에 1,389건(Jira 194). 그런 사건이 가장 최근이어도
    // 목록 칸을 차지하지 않는다. 사건을 이슈별로 먼저 묶어 자른 뒤 issue 를 붙이면 빈 이슈 묶음이 첫 칸을 먹고 빠진다
    @Test
    void issueLessPublicEventTakesNoSlot() {
        jdbc.sql("""
                insert into event(id,issue_id,title,label,occurred_at,occurred_at_basis,created_at,updated_at,role)
                values (4199,null,'이슈 밖 사건','키워드','2026-10-25T00:00:00Z','EXTRACTED',now(),now(),'MAIN')
                """).update();
        jdbc.sql("""
                insert into article(id,source,url,press_code,title,body,published_at,released_at,created_at)
                values (4199,'NEWSDATA','https://fixture.invalid/41/loose','fixture41','기사','본문',now(),now(),now())
                """).update();
        jdbc.sql("insert into article_event values (4199,4199,now())").update();

        var first = issues.findCards(null, "lastEventAt", PageRequest.of(0, 1));
        assertThat(first.getContent())
                .extracting(IssueQueryRepository.CardRow::id)
                .containsExactly(4102L);
        assertThat(first.getTotalElements()).isEqualTo(3);
        assertThat(issues.findCards(null, "lastEventAt", PageRequest.of(0, 3)).getContent())
                .extracting(IssueQueryRepository.CardRow::id)
                .containsExactly(4102L, 4101L, 4103L);
    }
}
