package kr.io.newlearn.common.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.RestController;

// 출입증을 봉인하기 전(INTERNAL_WORKER_KEY · INTERNAL_BATCH_KEY 가 빔)에는 직원용 문이 모두 닫혀 있어야 한다 (Jira 30)
// 빈 키와 빈 헤더가 「같다」고 통과하지 않는지 본다
@WebMvcTest(controllers = InternalKeyNotConfiguredTest.NoEndpoints.class)
@Import({SecurityConfig.class, InternalApiSecurityConfig.class})
class InternalKeyNotConfiguredTest {

    @RestController
    static class NoEndpoints {}

    @Autowired
    MockMvc mockMvc;

    @Test
    void everyInternalCallIsUnauthorizedUntilKeysAreSet() throws Exception {
        for (String path : new String[] {SecurityRulesTest.W1, SecurityRulesTest.B1}) {
            for (String key : new String[] {"", " ", "anything"}) {
                mockMvc.perform(post(path).header(InternalKeyFilter.HEADER, key))
                        .andExpect(status().isUnauthorized())
                        .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
            }
        }
    }
}
