package kr.io.newlearn.common.web;

import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.OffsetDateTime;
import kr.io.newlearn.common.security.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// 시각 규칙 (docs/api.md 1절 「시간」, Jira 100) — Spring Boot 4 · Jackson 3 기본값에서 확인한다
// 보낼 때는 +09:00, 받을 때는 Z 를 포함해 어떤 오프셋도 읽고, 오프셋이 없으면 400
@WebMvcTest(controllers = TimeFormatTest.TimeProbeController.class)
@Import({SecurityConfig.class, TimeFormatTest.TimeProbeController.class})
@WithMockUser
class TimeFormatTest {

    @Autowired
    MockMvc mockMvc;

    // DB 에서 읽은 Instant(마이크로초까지)를 응답에서는 +09:00 · 초 단위로
    @Test
    void responseTimeIsKstInSeconds() throws Exception {
        mockMvc.perform(get("/probe/times/sample"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.publishedAt").value("2026-10-06T09:30:00+09:00"));
    }

    // 없는 값은 필드를 빼지 않고 null 로 보낸다 (docs/api.md 1절 「없는 값」)
    @Test
    void missingTimeIsSentAsNull() throws Exception {
        mockMvc.perform(get("/probe/times/sample"))
                .andExpect(jsonPath("$", hasKey("releasedAt")))
                .andExpect(jsonPath("$.releasedAt").value(nullValue()));
    }

    @Test
    void bodyTimeInUtcIsAccepted() throws Exception {
        mockMvc.perform(post("/probe/times")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"occurredAt\": \"2026-10-06T00:30:00Z\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.publishedAt").value("2026-10-06T09:30:00+09:00"));
    }

    @Test
    void bodyTimeWithoutOffsetIsRejected() throws Exception {
        mockMvc.perform(post("/probe/times")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"occurredAt\": \"2026-10-06T09:30:00\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("occurredAt"))
                .andExpect(jsonPath("$.errors[0].reason").value("시각은 2026-10-06T09:30:00+09:00 처럼 오프셋까지 보내 주세요"));
    }

    @Test
    void queryTimeWithOffsetIsAccepted() throws Exception {
        mockMvc.perform(get("/probe/times").param("from", "2026-10-06T09:30:00+09:00"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.publishedAt").value("2026-10-06T09:30:00+09:00"));
    }

    @Test
    void queryTimeWithoutOffsetIsRejected() throws Exception {
        mockMvc.perform(get("/probe/times").param("from", "2026-10-06T09:30:00"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("from"))
                .andExpect(jsonPath("$.errors[0].reason").value("시각은 2026-10-06T09:30:00+09:00 처럼 오프셋까지 보내 주세요"));
    }

    @RestController
    @RequestMapping("/probe/times")
    static class TimeProbeController {

        @GetMapping("/sample")
        TimeResponse sample() {
            return new TimeResponse(ApiTime.toKst(Instant.parse("2026-10-06T00:30:00.123456Z")), ApiTime.toKst(null));
        }

        @PostMapping
        TimeResponse echoBody(@RequestBody TimeRequest request) {
            return new TimeResponse(ApiTime.toKst(request.occurredAt().toInstant()), null);
        }

        @GetMapping
        TimeResponse echoQuery(@RequestParam OffsetDateTime from) {
            return new TimeResponse(ApiTime.toKst(from.toInstant()), null);
        }
    }

    record TimeRequest(OffsetDateTime occurredAt) {}

    record TimeResponse(OffsetDateTime publishedAt, OffsetDateTime releasedAt) {}
}
