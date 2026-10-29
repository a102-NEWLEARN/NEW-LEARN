package kr.io.newlearn.dictionary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

// 사전 하루 한도 (docs/specs/F13-dictionary-api.md AC-9) — 한도까지는 부르고 넘으면 막는다.
// Redis 가 실패하면 세지 않고 부른다 — 안전장치일 뿐이라 사전 검색을 막지 않는다(그때는 결과 저장도 안 된다)
class DictionaryQuotaTest {

    StringRedisTemplate redis = mock(StringRedisTemplate.class);

    DictionaryQuota quota = new DictionaryQuota(redis, 2, Clock.systemUTC());

    private void counted(long used) {
        when(redis.execute(ArgumentMatchers.<RedisScript<Long>>any(), anyList(), any()))
                .thenReturn(used);
    }

    @Test
    void upToTheLimitIsAllowed() {
        counted(2);
        assertThat(quota.tryTake()).isTrue();
    }

    @Test
    void overTheLimitIsRefused() {
        counted(3);
        assertThat(quota.tryTake()).isFalse();
    }

    @Test
    void redisFailureLetsTheCallThrough() {
        when(redis.execute(ArgumentMatchers.<RedisScript<Long>>any(), anyList(), any()))
                .thenThrow(new RedisConnectionFailureException("끊김"));
        assertThat(quota.tryTake()).isTrue();
    }

    // 한국 날짜로 센다 — UTC 로는 아직 10-29 인 15:30Z 가 한국으로는 10-30 00:30 이다. 그 직전(14:59:59Z)은 10-29
    @Test
    void theCountKeyIsTheKoreanDateAcrossMidnight() {
        when(redis.execute(ArgumentMatchers.<RedisScript<Long>>any(), anyList(), any()))
                .thenReturn(1L);

        new DictionaryQuota(redis, 2, Clock.fixed(Instant.parse("2026-10-29T14:59:59Z"), ZoneOffset.UTC)).tryTake();
        new DictionaryQuota(redis, 2, Clock.fixed(Instant.parse("2026-10-29T15:30:00Z"), ZoneOffset.UTC)).tryTake();

        verify(redis).execute(ArgumentMatchers.<RedisScript<Long>>any(), eq(List.of("dictquota:2026-10-29")), any());
        verify(redis).execute(ArgumentMatchers.<RedisScript<Long>>any(), eq(List.of("dictquota:2026-10-30")), any());
    }
}
