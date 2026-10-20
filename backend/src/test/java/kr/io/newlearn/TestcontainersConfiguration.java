package kr.io.newlearn;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

// 이미지는 저장소 루트 compose.yaml 의 db · redis 와 같은 태그로 둔다
// CI 잡에는 Docker 가 없어서 NEWLEARN_TEST_TESTCONTAINERS=false 로 이 설정을 끄고,
// 잡 옆에 띄운 DB · Redis(.gitlab-ci.yml 의 services)에 application.yaml 의 DB_HOST · REDIS_HOST 로 붙는다
@TestConfiguration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "newlearn.test.testcontainers", havingValue = "true", matchIfMissing = true)
class TestcontainersConfiguration {

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgresContainer() {
        return new PostgreSQLContainer(
                DockerImageName.parse("pgvector/pgvector:0.8.7-pg18").asCompatibleSubstituteFor("postgres"));
    }

    @Bean
    @ServiceConnection(name = "redis")
    GenericContainer<?> redisContainer() {
        return new GenericContainer<>(DockerImageName.parse("redis:8.10.2")).withExposedPorts(6379);
    }
}
