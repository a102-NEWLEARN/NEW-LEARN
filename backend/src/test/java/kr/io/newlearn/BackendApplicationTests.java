package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.Objects;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.context.LifecycleProperties;
import org.springframework.boot.health.actuate.endpoint.HealthEndpointGroup;
import org.springframework.boot.health.actuate.endpoint.HealthEndpointGroups;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.web.server.Shutdown;
import org.springframework.boot.web.server.autoconfigure.ServerProperties;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class BackendApplicationTests {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    HealthEndpointGroups healthGroups;

    @Autowired
    ServerProperties server;

    @Autowired
    LifecycleProperties lifecycle;

    @Test
    void contextLoads() {}

    // 헬스는 DB · Redis 연결을 포함한다. 로그인 없이 열려 있어야 compose 와 쿠버네티스가 볼 수 있다
    @Test
    void healthIsUpWithoutLogin() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }

    // 쿠버네티스 프로브(infra/k8s/services/app/backend.yaml)가 묻는 전용 주소 — 쿠버네티스 밖(내 PC · 시험)에서도 같이 열린다 (Jira 29)
    @Test
    void livenessIsUpWithoutLogin() throws Exception {
        mockMvc.perform(get("/actuator/health/liveness"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    void readinessIsUpWithoutLogin() throws Exception {
        mockMvc.perform(get("/actuator/health/readiness"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }

    // 「요청을 받아도 되나」는 DB · Redis 까지 본다(SSOT.md 6절). 「살아 있나」는 둘을 보지 않는다 — DB 가 잠깐 끊겼다고 재시작하지 않게
    @Test
    void readinessChecksDbAndRedisButLivenessDoesNot() {
        assertThat(healthGroups.getNames()).contains("readiness", "liveness");
        HealthEndpointGroup readiness = Objects.requireNonNull(healthGroups.get("readiness"));
        HealthEndpointGroup liveness = Objects.requireNonNull(healthGroups.get("liveness"));
        assertThat(readiness.isMember("db")).isTrue();
        assertThat(readiness.isMember("redis")).isTrue();
        assertThat(liveness.isMember("db")).isFalse();
        assertThat(liveness.isMember("redis")).isFalse();
    }

    // 끝낼 때 — preStop 10초 + 받은 요청 마무리 20초 = 30초가 쿠버네티스 유예 40초 안에 든다 (SSOT.md 6절 「무중단 배포 조건」)
    @Test
    void shutdownFinishesWithinTheGracePeriod() {
        assertThat(server.getShutdown()).isEqualTo(Shutdown.GRACEFUL);
        assertThat(lifecycle.getTimeoutPerShutdownPhase()).isEqualTo(Duration.ofSeconds(20));
    }

    // Swagger(springdoc) — 개발하는 동안 FE 가 로그인 없이 본다 (SSOT.md 6절 「공개 화면」, Jira 107)
    // 내부 API(/internal/v1)는 밖에 열지 않는 주소라 문서에도 없어야 한다
    @Test
    void swaggerIsOpenWithoutLogin() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.openapi").exists())
                .andExpect(jsonPath("$.info.title").value("NEW:LEARN API"))
                .andExpect(jsonPath("$.paths", not(hasKey(startsWith("/internal")))));
        // springdoc 의 기본 주소는 화면 파일로 넘긴다
        mockMvc.perform(get("/swagger-ui.html"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/swagger-ui/index.html"));
        mockMvc.perform(get("/swagger-ui/index.html")).andExpect(status().isOk());
    }
}
