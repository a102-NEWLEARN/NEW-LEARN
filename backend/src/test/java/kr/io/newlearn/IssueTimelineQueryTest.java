package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.util.List;
import kr.io.newlearn.issue.IssueCardAssembler;
import kr.io.newlearn.issue.IssueQueryRepository;
import kr.io.newlearn.issue.IssueService;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

@DataJpaTest(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({TestcontainersConfiguration.class, IssueQueryRepository.class, IssueService.class, IssueCardAssembler.class})
class IssueTimelineQueryTest {
    @MockitoSpyBean
    JdbcClient jdbc;

    @Autowired
    IssueQueryRepository queries;

    @Autowired
    IssueService service;

    @Autowired
    EntityManager em;

    @Autowired
    EntityManagerFactory emf;

    @BeforeEach
    void fixtures() {
        CategoryIssueFixtures.insert(jdbc);
        jdbc.sql("insert into issue(id,title,created_at,updated_at) values (4800,'빈 이슈',now(),now())")
                .update();
        em.flush();
        em.clear();
    }

    @Test
    void singleIssueSharesCardAggregateAndRetainsEmptyIssues() {
        var card = queries.findCards(null, "lastEventAt", PageRequest.of(0, 20)).stream()
                .filter(c -> c.id() == 4102)
                .findFirst()
                .orElseThrow();
        assertThat(queries.findHeader(4102)).contains(card);
        var empty = queries.findHeader(4800).orElseThrow();
        assertThat(empty.eventCount()).isZero();
        assertThat(empty.articleCount()).isZero();
        assertThat(empty.publisherCount()).isZero();
        assertThat(empty.firstEventAt()).isNull();
        assertThat(empty.lastEventAt()).isNull();
        assertThat(queries.findHeader(999999)).isEmpty();
    }

    @Test
    void eventCountsExcludeHiddenArticlesAndDeduplicatePublishers() {
        var counts = queries.findEventCounts(List.of(4121L, 4122L, 4123L));
        assertThat(counts)
                .containsExactlyInAnyOrder(
                        new IssueQueryRepository.EventCountRow(4121, 2, 1),
                        new IssueQueryRepository.EventCountRow(4122, 0, 0),
                        new IssueQueryRepository.EventCountRow(4123, 0, 0));
        clearInvocations(jdbc);
        assertThat(queries.findEventCounts(List.of())).isEmpty();
        verifyNoInteractions(jdbc);
    }

    @Test
    void timelineUsesThreeQueriesForTwoAndNineEvents() {
        var statistics = emf.unwrap(SessionFactory.class).getStatistics();
        for (int size : new int[] {2, 9}) {
            jdbc.sql("delete from event where issue_id=4800").update();
            for (int n = 1; n <= size; n++) {
                jdbc.sql("""
                    insert into event(id,issue_id,title,label,occurred_at,occurred_at_basis,created_at,updated_at)
                    values (:id,4800,'사건','키워드','2026-10-20T00:00:00Z','EXTRACTED',now(),now())
                    """).param("id", 48000 + n).update();
            }
            em.clear();
            statistics.clear();
            clearInvocations(jdbc);
            var timeline = service.timeline(4800);
            assertThat(timeline.events()).hasSize(size);
            assertThat(timeline.events()).extracting(e -> e.id()).isSorted();
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(2);
            verify(jdbc, times(1)).sql(anyString());
        }
    }
}
