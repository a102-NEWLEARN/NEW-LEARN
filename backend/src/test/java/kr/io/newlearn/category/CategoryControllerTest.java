package kr.io.newlearn.category;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.List;
import kr.io.newlearn.category.dto.CategoryListResponse;
import kr.io.newlearn.category.dto.CategoryResponse;
import kr.io.newlearn.common.security.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(CategoryController.class)
@Import(SecurityConfig.class)
class CategoryControllerTest {
    @Autowired
    MockMvc mvc;

    @MockitoBean
    CategoryService service;

    @Test
    void anonymousListHasOnlyItems() throws Exception {
        when(service.list())
                .thenReturn(new CategoryListResponse(List.of(new CategoryResponse("politics", "정치", 0, 0))));
        mvc.perform(get("/api/v1/categories"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].code").value("politics"))
                .andExpect(jsonPath("$.items[0].issueCount").value(0))
                .andExpect(jsonPath("$.page").doesNotExist());
    }
}
