package kr.io.newlearn.issue;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.List;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.NotFoundException;
import kr.io.newlearn.common.security.SecurityConfig;
import kr.io.newlearn.common.web.PageResponse;
import kr.io.newlearn.issue.dto.IssueHeaderResponse;
import kr.io.newlearn.issue.dto.TimelineResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(IssueController.class)
@Import(SecurityConfig.class)
class IssueControllerTest {
    @Test
    void headerAndEmptyTimelineFollowJsonContract() throws Exception {
        when(service.get(48))
                .thenReturn(new IssueHeaderResponse(48, "빈 이슈", null, List.of(), 0, 0, 0, null, null, null));
        when(service.timeline(48)).thenReturn(new TimelineResponse(48, List.of()));
        mvc.perform(get("/api/v1/issues/48"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(48))
                .andExpect(jsonPath("$.firstEventAt").hasJsonPath())
                .andExpect(jsonPath("$.firstEventAt").isEmpty())
                .andExpect(jsonPath("$.lastEvent").doesNotExist());
        mvc.perform(get("/api/v1/issues/48/timeline"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issueId").value(48))
                .andExpect(jsonPath("$.events").isEmpty())
                .andExpect(jsonPath("$.relations").doesNotExist());
    }

    @Test
    void badDetailIdFailsBeforeService() throws Exception {
        mvc.perform(get("/api/v1/issues/invalid/timeline"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        verifyNoInteractions(service);
    }

    @Autowired
    MockMvc mvc;

    @MockitoBean
    IssueService service;

    @Test
    void defaultAndExplicitParametersArePassedToService() throws Exception {
        when(service.list(any(), anyString(), any())).thenReturn(new PageResponse<>(List.of(), 0, 20, 0, 0));
        mvc.perform(get("/api/v1/issues"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.size").value(20));
        verify(service).list(isNull(), eq("lastEventAt"), argThat(q -> q.page() == 0 && q.size() == 20));
        mvc.perform(get("/api/v1/issues")
                        .param("sort", "createdAt")
                        .param("category", "politics")
                        .param("page", "2")
                        .param("size", "3"))
                .andExpect(status().isOk());
        verify(service).list(eq("politics"), eq("createdAt"), argThat(q -> q.page() == 2 && q.size() == 3));
    }

    @Test
    void rejectsBadSortAndPaginationBeforeService() throws Exception {
        for (String[] param :
                new String[][] {{"sort", "bad"}, {"page", "-1"}, {"size", "0"}, {"size", "101"}, {"size", "abc"}}) {
            mvc.perform(get("/api/v1/issues").param(param[0], param[1]))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.errors[0].field").value(param[0]));
        }
        verifyNoInteractions(service);
    }

    @Test
    void emptySortIsNotTheDefault() throws Exception {
        mvc.perform(get("/api/v1/issues").param("sort", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("sort"));
        verifyNoInteractions(service);
    }

    @Test
    void mapsMissingCategory() throws Exception {
        when(service.list(eq("unknown"), anyString(), any()))
                .thenThrow(new NotFoundException(ErrorCode.CATEGORY_NOT_FOUND, "없는 카테고리"));
        mvc.perform(get("/api/v1/issues").param("category", "unknown"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CATEGORY_NOT_FOUND"));
    }
}
