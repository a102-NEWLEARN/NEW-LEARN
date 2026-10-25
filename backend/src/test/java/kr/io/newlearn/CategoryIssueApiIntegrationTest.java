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
class CategoryIssueApiIntegrationTest {
    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @BeforeEach
    void fixtures() {
        CategoryIssueFixtures.insert(jdbc);
    }

    @Test
    void categoriesIncludeZerosAndOnlyReleasedArticles() throws Exception {
        mvc.perform(get("/api/v1/categories"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(5)))
                .andExpect(jsonPath("$.page").doesNotExist())
                .andExpect(jsonPath("$.items[0].code").value("politics"))
                .andExpect(jsonPath("$.items[1].code").value("economy"))
                .andExpect(jsonPath("$.items[2].code").value("society"))
                .andExpect(jsonPath("$.items[3].code").value("world"))
                .andExpect(jsonPath("$.items[4].code").value("it_science"))
                .andExpect(jsonPath("$.items[0].issueCount").value(2))
                .andExpect(jsonPath("$.items[0].articleCount").value(2))
                .andExpect(jsonPath("$.items[4].issueCount").value(0));
    }

    @Test
    void cardsAggregateWithoutMultiplyingRowsAndSelectLastEventTie() throws Exception {
        mvc.perform(get("/api/v1/issues").param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.totalPages").value(3))
                .andExpect(jsonPath("$.items[0].id").value(4102))
                .andExpect(jsonPath("$.items[0].summary").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.items[0].eventCount").value(3))
                .andExpect(jsonPath("$.items[0].articleCount").value(2))
                .andExpect(jsonPath("$.items[0].publisherCount").value(1))
                .andExpect(jsonPath("$.items[0].categories", hasSize(2)))
                .andExpect(jsonPath("$.items[0].categories[0].code").value("politics"))
                .andExpect(jsonPath("$.items[0].categories[1].code").value("economy"))
                .andExpect(jsonPath("$.items[0].lastEvent.id").value(4123))
                .andExpect(jsonPath("$.items[0].lastEventAt").value("2026-10-22T09:00:00+09:00"))
                .andExpect(jsonPath("$.items[0].firstEventAt").value("2026-10-20T09:00:00+09:00"));
    }

    @Test
    void createdSortFilterAndBeyondLastPage() throws Exception {
        mvc.perform(get("/api/v1/issues").param("sort", "createdAt").param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(4103));
        mvc.perform(get("/api/v1/issues").param("category", "economy"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/v1/issues").param("category", "it_science"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)));
        mvc.perform(get("/api/v1/issues").param("page", "9").param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)))
                .andExpect(jsonPath("$.totalElements").value(3));
    }

    @Test
    void emptySortIsRejected() throws Exception {
        mvc.perform(get("/api/v1/issues").param("sort", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    void unknownCategoryAndInvalidParametersUseCommonErrors() throws Exception {
        mvc.perform(get("/api/v1/issues").param("category", "unknown"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CATEGORY_NOT_FOUND"));
        for (String[] param :
                new String[][] {{"sort", "bad"}, {"page", "-1"}, {"size", "0"}, {"size", "101"}, {"page", "abc"}}) {
            mvc.perform(get("/api/v1/issues").param(param[0], param[1]))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.errors[0].field").value(param[0]));
        }
    }
}
