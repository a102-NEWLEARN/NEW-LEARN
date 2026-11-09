package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@Transactional
class EventApiIntegrationTest {
    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    EntityManager em;

    @Autowired
    EntityManagerFactory emf;

    @BeforeEach
    void fixtures() {
        EventApiFixtures.insert(jdbc);
        em.flush();
        em.clear();
    }

    @Test
    void panelUsesStoredSummaryReleasedCountsAndCodeSortedDistinctPublishers() throws Exception {
        mvc.perform(get("/api/v1/events/4902"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(4902))
                .andExpect(jsonPath("$.title").value("가운데 사건"))
                .andExpect(jsonPath("$.label").value("둘째"))
                .andExpect(jsonPath("$.summary").value("저장된 사건 요약"))
                .andExpect(jsonPath("$.occurredAt").value("2026-10-20T09:00:00+09:00"))
                .andExpect(jsonPath("$.occurredAtBasis").value("FIRST_PUBLISHED"))
                .andExpect(jsonPath("$.issue.id").value(4900))
                .andExpect(jsonPath("$.articleCount").value(10))
                .andExpect(jsonPath("$.publishers[*].code", contains("article42", "event49a", "event49z")))
                .andExpect(jsonPath("$.publishers[2].name").value("나신문"));
    }

    @Test
    void neighboursIncludeEqualOccurrenceTimesAndStayInsideIssue() throws Exception {
        // 공개 기사가 있는 사건만 이웃이 된다(Jira 179) — 네 사건에 공개 기사를 나눠 둔다
        moveArticle(4202, 4901);
        moveArticle(4203, 4903);
        moveArticle(4204, 4904);
        long[] ids = {4901, 4902, 4903, 4904};
        for (int n = 0; n < ids.length; n++) {
            var response = mvc.perform(get("/api/v1/events/" + ids[n])).andExpect(status().isOk());
            if (n == 0)
                response.andExpect(jsonPath("$.previousEvent").hasJsonPath())
                        .andExpect(jsonPath("$.previousEvent").isEmpty());
            else response.andExpect(jsonPath("$.previousEvent.id").value(ids[n - 1]));
            if (n == ids.length - 1)
                response.andExpect(jsonPath("$.nextEvent").hasJsonPath())
                        .andExpect(jsonPath("$.nextEvent").isEmpty());
            else response.andExpect(jsonPath("$.nextEvent.id").value(ids[n + 1]));
        }
    }

    @Test
    void standaloneEventKeepsNullRelationsAndEventsWithoutPublicArticlesAreNotFound() throws Exception {
        moveArticle(4202, 4905);
        mvc.perform(get("/api/v1/events/4905"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issue").hasJsonPath())
                .andExpect(jsonPath("$.issue").isEmpty())
                .andExpect(jsonPath("$.previousEvent").hasJsonPath())
                .andExpect(jsonPath("$.previousEvent").isEmpty())
                .andExpect(jsonPath("$.nextEvent").hasJsonPath())
                .andExpect(jsonPath("$.nextEvent").isEmpty())
                .andExpect(jsonPath("$.summary").hasJsonPath())
                .andExpect(jsonPath("$.summary").isEmpty());
        // 4901 은 기사가 없고 4906 은 공개 전 기사만 있다 — 둘 다 없는 사건이다(docs/api.md 1절, Jira 179)
        moveArticle(4210, 4906);
        for (long id : new long[] {4901, 4906}) {
            for (String suffix : new String[] {"", "/articles"}) {
                mvc.perform(get("/api/v1/events/" + id + suffix))
                        .andExpect(status().isNotFound())
                        .andExpect(jsonPath("$.code").value("EVENT_NOT_FOUND"));
            }
        }
    }

    private void moveArticle(long articleId, long eventId) {
        jdbc.sql("update article_event set event_id=:event where article_id=:article")
                .param("event", eventId)
                .param("article", articleId)
                .update();
    }

    @Test
    void articlesUsePublicationThenIdAscendingWithFourItemPages() throws Exception {
        mvc.perform(get("/api/v1/events/4902/articles").param("size", "4"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", contains(4211, 4202, 4203, 4204)))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(4))
                .andExpect(jsonPath("$.totalElements").value(10))
                .andExpect(jsonPath("$.totalPages").value(3));
        mvc.perform(get("/api/v1/events/4902/articles").param("size", "4").param("page", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", contains(4205, 4206, 4207, 4208)));
        mvc.perform(get("/api/v1/events/4902/articles").param("size", "4").param("page", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", contains(4209, 4201)));
        mvc.perform(get("/api/v1/events/4902/articles").param("page", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)))
                .andExpect(jsonPath("$.totalElements").value(10));
    }

    @Test
    void summariesAndAnalysisStatusesReuseArticleApiContract() throws Exception {
        mvc.perform(get("/api/v1/events/4902/articles"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(20))
                .andExpect(jsonPath(
                        "$.items[*].mindmapStatus",
                        contains(
                                "QUEUED",
                                "SUCCEEDED",
                                "NONE",
                                "SUCCEEDED",
                                "FAILED",
                                "SUCCEEDED",
                                "SUCCEEDED",
                                "SUCCEEDED",
                                "SUCCEEDED",
                                "SUCCEEDED")))
                .andExpect(jsonPath("$.items[2].category").hasJsonPath())
                .andExpect(jsonPath("$.items[2].category").isEmpty())
                .andExpect(jsonPath("$.items[3].summary").hasJsonPath())
                .andExpect(jsonPath("$.items[3].summary").isEmpty())
                .andExpect(jsonPath("$.items[9].summary").value("우리 요약"))
                .andExpect(jsonPath("$.items[9].publishedAt").value("2026-10-23T09:00:00+09:00"))
                .andExpect(jsonPath("$.items[9].publisher.code").value("event49z"))
                .andExpect(jsonPath("$.items[9].url").value("https://fixture.invalid/article42/1"))
                .andExpect(jsonPath("$.items[9].summarySource").doesNotExist())
                .andExpect(jsonPath("$.items[9].body").doesNotExist());
    }

    @Test
    void missingEventsAndInvalidRequestsUseCommonErrors() throws Exception {
        for (String suffix : new String[] {"", "/articles"}) {
            mvc.perform(get("/api/v1/events/999999" + suffix))
                    .andExpect(status().isNotFound())
                    .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                    .andExpect(jsonPath("$.code").value("EVENT_NOT_FOUND"));
            mvc.perform(get("/api/v1/events/invalid" + suffix))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        }
        for (String[] param : new String[][] {{"page", "-1"}, {"size", "0"}, {"size", "101"}, {"page", "abc"}}) {
            mvc.perform(get("/api/v1/events/4902/articles").param(param[0], param[1]))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        }
    }

    @Test
    void articlePagesUseFourQueriesRegardlessOfItemCount() throws Exception {
        var statistics = emf.unwrap(SessionFactory.class).getStatistics();
        for (int size : new int[] {2, 4}) {
            em.clear();
            statistics.clear();
            mvc.perform(get("/api/v1/events/4902/articles").param("size", String.valueOf(size)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items", hasSize(size)));
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(4);
        }
    }

    @Test
    void panelsUseFiveQueriesRegardlessOfLinkedArticleCount() throws Exception {
        var statistics = emf.unwrap(SessionFactory.class).getStatistics();
        for (int count : new int[] {2, 10}) {
            jdbc.sql("update article_event set event_id=4902").update();
            jdbc.sql("update article_event set event_id=4901 where article_id > :last")
                    .param("last", 4200 + count)
                    .update();
            em.clear();
            statistics.clear();
            mvc.perform(get("/api/v1/events/4902")).andExpect(status().isOk());
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(5);
        }
    }
}
