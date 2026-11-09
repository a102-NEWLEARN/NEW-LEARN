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
    void singleIssueSharesCardAggregateAndLeavesOutIssuesWithoutPublicArticles() {
        var card = queries.findCards(null, "lastEventAt", PageRequest.of(0, 20)).stream()
                .filter(c -> c.id() == 4102)
                .findFirst()
                .orElseThrow();
        assertThat(queries.findHeader(4102)).contains(card);
        assertThat(queries.findHeader(4800)).isEmpty();
        assertThat(queries.findHeader(999999)).isEmpty();
    }

    @Test
    void eventCountsExcludeHiddenArticlesAndDeduplicatePublishers() {
        var counts = queries.findEventCounts(List.of(4121L, 4122L, 4123L));
        assertThat(counts)
                .containsExactlyInAnyOrder(
                        new IssueQueryRepository.EventCountRow(4121, 2, 1),
                        new IssueQueryRepository.EventCountRow(4122, 1, 1),
                        new IssueQueryRepository.EventCountRow(4123, 1, 1));
        clearInvocations(jdbc);
        assertThat(queries.findEventCounts(List.of())).isEmpty();
        verifyNoInteractions(jdbc);
    }

    @Test
    void timelineUsesTwoQueriesForTwoAndNineEvents() {
        var statistics = emf.unwrap(SessionFactory.class).getStatistics();
        for (int size : new int[] {2, 9}) {
            jdbc.sql("delete from article_event where event_id between 48001 and 48009")
                    .update();
            jdbc.sql("delete from article where id between 48001 and 48009").update();
            jdbc.sql("delete from event where issue_id=4800").update();
            for (int n = 1; n <= size; n++) {
                jdbc.sql("""
                    insert into event(id,issue_id,title,label,occurred_at,occurred_at_basis,created_at,updated_at,role)
                    values (:id,4800,'사건','키워드','2026-10-20T00:00:00Z','EXTRACTED',now(),now(),'MAIN')
                    """).param("id", 48000 + n).update();
                jdbc.sql("""
                    insert into article(id,source,url,press_code,title,body,published_at,released_at,created_at)
                    values (:id,'NEWSDATA',:url,'fixture41','기사','본문',now(),now(),now())
                    """)
                        .param("id", 48000 + n)
                        .param("url", "https://fixture.invalid/48/" + n)
                        .update();
                jdbc.sql("insert into article_event values (:id,:id,now())")
                        .param("id", 48000 + n)
                        .update();
            }
            em.clear();
            statistics.clear();
            clearInvocations(jdbc);
            var timeline = service.timeline(4800);
            assertThat(timeline.events()).hasSize(size);
            assertThat(timeline.events()).extracting(e -> e.id()).isSorted();
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
            verify(jdbc, times(1)).sql(anyString());
        }
    }
}
