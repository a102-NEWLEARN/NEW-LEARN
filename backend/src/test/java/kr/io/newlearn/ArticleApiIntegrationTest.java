package kr.io.newlearn;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@Transactional
class ArticleApiIntegrationTest {
    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @BeforeEach
    void fixtures() {
        ArticleApiFixtures.insert(jdbc);
    }

    @Test
    void listsReleasedArticlesInPublicationAndIdOrder() throws Exception {
        mvc.perform(get("/api/v1/articles").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(10))
                .andExpect(jsonPath("$.totalPages").value(5))
                .andExpect(jsonPath("$.items[0].id").value(4201))
                .andExpect(jsonPath("$.items[1].id").value(4209))
                .andExpect(jsonPath("$.items[0].summary").value("우리 요약"))
                .andExpect(jsonPath("$.items[0].summarySource").doesNotExist())
                .andExpect(jsonPath("$.items[0].publishedAt").value("2026-10-23T09:00:00+09:00"))
                .andExpect(jsonPath("$.items[0].body").doesNotExist());
        mvc.perform(get("/api/v1/articles").param("size", "2").param("page", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(4208));
    }

    @Test
    void filtersAndEmptyPagesKeepCorrectTotals() throws Exception {
        mvc.perform(get("/api/v1/articles").param("category", "politics"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].id").value(4202));
        mvc.perform(get("/api/v1/articles").param("category", "world"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)));
        mvc.perform(get("/api/v1/articles").param("page", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)))
                .andExpect(jsonPath("$.totalElements").value(10));
    }

    @Test
    void summaryIsOursOnlyAndDetailFieldsAreFlat() throws Exception {
        mvc.perform(get("/api/v1/articles/4201"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(4201))
                .andExpect(jsonPath("$.reporter").value("기자"))
                .andExpect(jsonPath("$.summary").value("우리 요약"))
                .andExpect(jsonPath("$.summarySource").doesNotExist())
                .andExpect(jsonPath("$.event.id").value(4200))
                .andExpect(jsonPath("$.issue.id").value(4200))
                .andExpect(jsonPath("$.eventMatchStatus").value("SUCCEEDED"))
                .andExpect(jsonPath("$.body").doesNotExist())
                .andExpect(jsonPath("$.article").doesNotExist());
        // 4202 · 4204 는 NewsData 요약(source_summary)만 있다 — 대신 쓰지 않는다(2026-10-26)
        for (long id : new long[] {4202, 4203, 4204, 4205}) {
            mvc.perform(get("/api/v1/articles/" + id))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.summary").hasJsonPath())
                    .andExpect(jsonPath("$.summary").isEmpty())
                    .andExpect(jsonPath("$.summarySource").doesNotExist());
        }
    }

    @Test
    void statusesAndOptionalRelationsFollowStoredFacts() throws Exception {
        for (long id : new long[] {4201, 4202, 4204, 4206, 4207, 4208, 4209}) {
            mvc.perform(get("/api/v1/articles/" + id))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.mindmapStatus").value("SUCCEEDED"));
        }
        mvc.perform(get("/api/v1/articles/4203"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mindmapStatus").value("NONE"))
                .andExpect(jsonPath("$.eventMatchStatus").value("NONE"))
                .andExpect(jsonPath("$.category").hasJsonPath())
                .andExpect(jsonPath("$.category").isEmpty())
                .andExpect(jsonPath("$.event").hasJsonPath())
                .andExpect(jsonPath("$.event").isEmpty())
                .andExpect(jsonPath("$.issue").hasJsonPath())
                .andExpect(jsonPath("$.issue").isEmpty());
        mvc.perform(get("/api/v1/articles/4205"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mindmapStatus").value("FAILED"))
                .andExpect(jsonPath("$.eventMatchStatus").value("FAILED"));
        mvc.perform(get("/api/v1/articles/4211"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mindmapStatus").value("QUEUED"));
        mvc.perform(get("/api/v1/articles/4202"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.eventMatchStatus").value("QUEUED"));
        mvc.perform(get("/api/v1/articles/4206"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.event.id").value(4201))
                .andExpect(jsonPath("$.issue").isEmpty());
    }

    @Test
    void missingAndUnreleasedResourcesAndBadInputs() throws Exception {
        for (long id : new long[] {4210, 999999}) {
            mvc.perform(get("/api/v1/articles/" + id))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("ARTICLE_NOT_FOUND"));
        }
        for (String category : new String[] {"unknown", ""}) {
            mvc.perform(get("/api/v1/articles").param("category", category))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("CATEGORY_NOT_FOUND"));
        }
        for (String[] param : new String[][] {{"page", "-1"}, {"size", "0"}, {"size", "101"}, {"page", "abc"}}) {
            mvc.perform(get("/api/v1/articles").param(param[0], param[1]))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        }
    }
}
