package kr.io.newlearn.event;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.List;
import kr.io.newlearn.common.security.SecurityConfig;
import kr.io.newlearn.common.web.PageResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(EventController.class)
@Import(SecurityConfig.class)
class EventControllerTest {
    @Autowired
    MockMvc mvc;

    @MockitoBean
    EventService service;

    @Test
    void paginationDefaultsAndExplicitFourItemPageReachService() throws Exception {
        when(service.articles(eq(49L), anyString(), any(), isNull()))
                .thenReturn(new PageResponse<>(List.of(), 0, 20, 0, 0));
        mvc.perform(get("/api/v1/events/49/articles")).andExpect(status().isOk());
        verify(service).articles(eq(49L), eq("oldest"), argThat(q -> q.page() == 0 && q.size() == 20), isNull());
        mvc.perform(get("/api/v1/events/49/articles").param("page", "2").param("size", "4"))
                .andExpect(status().isOk());
        verify(service).articles(eq(49L), eq("oldest"), argThat(q -> q.page() == 2 && q.size() == 4), isNull());
    }

    @Test
    void latestSortReachesService() throws Exception {
        when(service.articles(eq(49L), anyString(), any(), isNull()))
                .thenReturn(new PageResponse<>(List.of(), 0, 5, 0, 0));
        mvc.perform(get("/api/v1/events/49/articles").param("sort", "latest").param("size", "5"))
                .andExpect(status().isOk());
        verify(service).articles(eq(49L), eq("latest"), argThat(q -> q.page() == 0 && q.size() == 5), isNull());
    }

    @Test
    void invalidPaginationAndIdsFailBeforeService() throws Exception {
        for (String[] param : new String[][] {
            {"sort", "bad"}, {"sort", ""}, {"page", "-1"}, {"size", "0"}, {"size", "101"}, {"page", "abc"}
        }) {
            mvc.perform(get("/api/v1/events/49/articles").param(param[0], param[1]))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.errors[0].field").value(param[0]));
        }
        mvc.perform(get("/api/v1/events/invalid")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/events/invalid/articles")).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
}
