package kr.io.newlearn.common;

import io.lettuce.core.resource.Delay;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import org.springframework.boot.data.redis.autoconfigure.ClientResourcesBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

// Redis 가 끊겼다 다시 뜰 때 Lettuce 가 다시 붙는 간격 — 기본은 두 배씩 늘어 30초까지 간다. Redis 는 2~3초면 다시 뜨므로
// (2026-11-02 재시작 실측 2.63초) 100ms 부터 두 배씩 늘려 1초에서 멈춘다. 명령 대기 · 한 번 붙어 보기 상한은
// application.yaml 의 spring.data.redis (Jira 145)
@Configuration
public class RedisClientConfig {

    @Bean
    ClientResourcesBuilderCustomizer redisReconnectDelay() {
        return builder -> builder.reconnectDelay(
                Delay.exponential(Duration.ofMillis(100), Duration.ofSeconds(1), 2, TimeUnit.MILLISECONDS));
    }
}
