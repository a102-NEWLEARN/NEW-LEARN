package kr.io.newlearn.article;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.List;
import kr.io.newlearn.article.dto.*;
import kr.io.newlearn.common.security.SecurityConfig;
import kr.io.newlearn.common.web.PageResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ArticleController.class)
@Import(SecurityConfig.class)
class ArticleControllerTest {
    @Autowired
    MockMvc mvc;

    @MockitoBean
    ArticleService service;

    @Test
    void listDefaultsAndCategoryArePassedToService() throws Exception {
        when(service.list(any(), any(), isNull())).thenReturn(new PageResponse<>(List.of(), 0, 20, 0, 0));
        mvc.perform(get("/api/v1/articles"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty());
        verify(service).list(isNull(), argThat(q -> q.page() == 0 && q.size() == 20), isNull());
        mvc.perform(get("/api/v1/articles")
                        .param("category", "economy")
                        .param("page", "2")
                        .param("size", "3"))
                .andExpect(status().isOk());
        verify(service).list(eq("economy"), argThat(q -> q.page() == 2 && q.size() == 3), isNull());
    }

    @Test
    void invalidInputsFailBeforeService() throws Exception {
        for (String[] param : new String[][] {{"page", "-1"}, {"size", "0"}, {"size", "101"}, {"page", "abc"}}) {
            mvc.perform(get("/api/v1/articles").param(param[0], param[1]))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.errors[0].field").value(param[0]));
        }
        mvc.perform(get("/api/v1/articles/not-a-number")).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void detailUnwrapsSummaryAndKeepsNullFields() throws Exception {
        var summary = new ArticleSummaryResponse(
                42,
                "기사",
                new ArticleSummaryResponse.PublisherRef("p", "신문"),
                null,
                null,
                null,
                "https://fixture.invalid",
                ArticleAnalysisStatus.NONE,
                false);
        when(service.get(42, null))
                .thenReturn(new ArticleDetailResponse(summary, null, ArticleAnalysisStatus.NONE, null, null));
        mvc.perform(get("/api/v1/articles/42"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(42))
                .andExpect(jsonPath("$.publisher.name").value("신문"))
                .andExpect(jsonPath("$.summary").hasJsonPath())
                .andExpect(jsonPath("$.summary").isEmpty())
                .andExpect(jsonPath("$.summarySource").doesNotExist())
                .andExpect(jsonPath("$.reporter").hasJsonPath())
                .andExpect(jsonPath("$.reporter").isEmpty())
                .andExpect(jsonPath("$.eventMatchStatus").value("NONE"))
                .andExpect(jsonPath("$.article").doesNotExist())
                .andExpect(jsonPath("$.body").doesNotExist());
    }
}
