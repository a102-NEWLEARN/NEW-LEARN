package kr.io.newlearn.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

// 출입증 필터의 키 다루기 (Jira 30) — 보안 체인 없이 필터만 부른다
class InternalKeyFilterTest {

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    // Secret 값 끝에 줄바꿈이 붙어도 맞는 헤더는 통과한다
    @Test
    void configuredKeyIgnoresSurroundingWhitespace() throws Exception {
        assertThat(roleFor(new InternalKeyFilter("worker-key\n", " batch-key "), "worker-key"))
                .isEqualTo("ROLE_WORKER");
        assertThat(roleFor(new InternalKeyFilter("worker-key\n", " batch-key "), "batch-key"))
                .isEqualTo("ROLE_BATCH");
    }

    // 두 키가 같으면 배치가 늘 워커로 들어와 원인을 찾기 어렵다 — 뜰 때 멈춘다
    @Test
    void sameKeyForBothDoorsIsRejectedAtStartup() {
        assertThatThrownBy(() -> new InternalKeyFilter("same-key", " same-key\n"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining("same-key");
    }

    private static String roleFor(InternalKeyFilter filter, String header) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/internal/v1/analysis-jobs/1/result");
        request.addHeader(InternalKeyFilter.HEADER, header);
        AtomicReference<Authentication> seen = new AtomicReference<>();
        filter.doFilter(
                request,
                new MockHttpServletResponse(),
                (req, res) -> seen.set(SecurityContextHolder.getContext().getAuthentication()));
        return seen.get() == null
                ? null
                : seen.get().getAuthorities().iterator().next().getAuthority();
    }
}
