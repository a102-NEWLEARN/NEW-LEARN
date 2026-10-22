package kr.io.newlearn.common.web;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.validation.Valid;
import java.util.List;
import java.util.stream.IntStream;
import kr.io.newlearn.common.security.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// 목록 요청 · 응답 (docs/api.md 1절 「목록 응답」 · 「목록 요청」, Jira 100)
// page 0부터 · size 기본 20 · 최대 100. 범위를 벗어나면 잘라 주지 않고 400
@WebMvcTest(controllers = PageResponseTest.PageProbeController.class)
@Import({SecurityConfig.class, PageResponseTest.PageProbeController.class})
@WithMockUser
class PageResponseTest {

    @Autowired
    MockMvc mockMvc;

    @Test
    void defaultsArePageZeroSizeTwenty() throws Exception {
        mockMvc.perform(get("/probe/pages"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(20)))
                .andExpect(jsonPath("$.items[0]").value("기사 1"))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(20))
                .andExpect(jsonPath("$.totalElements").value(23))
                .andExpect(jsonPath("$.totalPages").value(2));
    }

    // 「더 보기」: page + 1 < totalPages 이면 다음 쪽이 있다
    @Test
    void lastPageHasTheRest() throws Exception {
        mockMvc.perform(get("/probe/pages").param("page", "1").param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(3)))
                .andExpect(jsonPath("$.items[0]").value("기사 21"))
                .andExpect(jsonPath("$.page").value(1));
    }

    // 빈 결과는 200 과 빈 items (docs/api.md 1절 「빈 결과」)
    @Test
    void emptyResultHasEmptyItems() throws Exception {
        mockMvc.perform(get("/probe/pages/empty"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)))
                .andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.totalPages").value(0));
    }

    @Test
    void sizeOverHundredIsRejected() throws Exception {
        mockMvc.perform(get("/probe/pages").param("size", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("size"))
                .andExpect(jsonPath("$.errors[0].reason").value("size 는 1에서 100 사이여야 해요"));
    }

    @Test
    void sizeZeroIsRejected() throws Exception {
        mockMvc.perform(get("/probe/pages").param("size", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("size"))
                .andExpect(jsonPath("$.errors[0].reason").value("size 는 1에서 100 사이여야 해요"));
    }

    @Test
    void negativePageIsRejected() throws Exception {
        mockMvc.perform(get("/probe/pages").param("page", "-1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("page"))
                .andExpect(jsonPath("$.errors[0].reason").value("page 는 0 이상이어야 해요"));
    }

    @Test
    void nonNumberSizeIsRejected() throws Exception {
        mockMvc.perform(get("/probe/pages").param("size", "abc"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("size"))
                .andExpect(jsonPath("$.errors[0].reason").value("숫자로 보내 주세요"));
    }

    // 기사 23개가 있다고 치고 요청한 쪽만 잘라 준다. 실제 API 에서는 리포지토리가 Page 를 돌려준다
    @RestController
    @RequestMapping("/probe/pages")
    static class PageProbeController {

        static final List<String> ARTICLES =
                IntStream.rangeClosed(1, 23).mapToObj(i -> "기사 " + i).toList();

        @GetMapping
        PageResponse<String> list(@Valid PageQuery query) {
            Pageable pageable = query.toPageable(Sort.unsorted());
            int from = (int) Math.min(pageable.getOffset(), ARTICLES.size());
            int to = Math.min(from + pageable.getPageSize(), ARTICLES.size());
            return PageResponse.from(new PageImpl<>(ARTICLES.subList(from, to), pageable, ARTICLES.size()));
        }

        @GetMapping("/empty")
        PageResponse<String> empty(@Valid PageQuery query) {
            return PageResponse.from(new PageImpl<>(List.of(), query.toPageable(Sort.unsorted()), 0));
        }
    }
}
