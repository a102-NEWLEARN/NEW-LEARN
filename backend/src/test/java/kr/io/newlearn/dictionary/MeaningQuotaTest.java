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

// 문맥 뜻 하루 한도 (docs/specs/F13-dictionary-api.md AC-15) — 사전 한도(DictionaryQuota)와 달리 세지 못하면 막는다.
// GMS 비용의 상한이 이 한도 하나라서다
class MeaningQuotaTest {

    StringRedisTemplate redis = mock(StringRedisTemplate.class);

    MeaningQuota quota = new MeaningQuota(redis, 2, Clock.systemUTC());

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
    void redisFailureRefusesTheCall() {
        when(redis.execute(ArgumentMatchers.<RedisScript<Long>>any(), anyList(), any()))
                .thenThrow(new RedisConnectionFailureException("끊김"));
        assertThat(quota.tryTake()).isFalse();
    }

    @Test
    void zeroLimitTurnsTheCallsOff() {
        counted(1);
        assertThat(new MeaningQuota(redis, 0, Clock.systemUTC()).tryTake()).isFalse();
    }

    // 한국 날짜로 센다 — 사전 한도와 같은 경계, 다른 키 앞머리
    @Test
    void theCountKeyIsTheKoreanDate() {
        counted(1);
        new MeaningQuota(redis, 2, Clock.fixed(Instant.parse("2026-11-09T15:30:00Z"), ZoneOffset.UTC)).tryTake();
        verify(redis).execute(ArgumentMatchers.<RedisScript<Long>>any(), eq(List.of("meaningquota:2026-11-10")), any());
    }
}
