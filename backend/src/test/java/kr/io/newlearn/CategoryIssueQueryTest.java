package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import kr.io.newlearn.category.CategoryQueryRepository;
import kr.io.newlearn.category.CategoryRepository;
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
@Import({TestcontainersConfiguration.class, CategoryQueryRepository.class, IssueQueryRepository.class})
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
        assertThat(card.articleCount()).isEqualTo(2);
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
        assertThat(issues.findCategories(List.of())).isEmpty();
        assertThat(issues.findLastEvents(List.of())).isEmpty();
    }
}
