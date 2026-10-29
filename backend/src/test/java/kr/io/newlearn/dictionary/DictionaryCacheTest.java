package kr.io.newlearn.dictionary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.List;
import kr.io.newlearn.dictionary.dto.DictionaryItem;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.RedisSystemException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import tools.jackson.databind.json.JsonMapper;

// 사전 결과 저장소 (docs/specs/F13-dictionary-api.md AC-5 · AC-6)
// Redis 가 꽉 차거나(noeviction) 끊겨도 사전 검색은 막지 않는다 — 저장 · 읽기 실패는 건너뛴다
class DictionaryCacheTest {

    StringRedisTemplate redis = mock(StringRedisTemplate.class);

    @SuppressWarnings("unchecked")
    ValueOperations<String, String> values = mock(ValueOperations.class);

    DictionaryCache cache = new DictionaryCache(redis, JsonMapper.builder().build());

    List<DictionaryItem> items =
            List.of(new DictionaryItem("구원^투수", "명사", "뜻풀이 하나"), new DictionaryItem("나무", null, "뜻풀이 둘"));

    @BeforeEach
    void wireValues() {
        when(redis.opsForValue()).thenReturn(values);
    }

    @Test
    void savedItemsComeBackTheSameWithOneDayExpiry() {
        cache.put("구원투수", items);
        ArgumentCaptor<String> saved = ArgumentCaptor.forClass(String.class);
        verify(values).set(eq("dict:구원투수"), saved.capture(), eq(Duration.ofDays(1)));

        when(values.get("dict:구원투수")).thenReturn(saved.getValue());
        assertThat(cache.get("구원투수")).contains(items);
    }

    @Test
    void missingKeyIsEmpty() {
        assertThat(cache.get("나무")).isEmpty();
    }

    // 손으로 고친 값 · 칸 이름이 바뀌기 전의 옛 값도 500 이 아니라 없는 것으로 본다
    @Test
    void brokenSavedValueIsTreatedAsMissing() {
        for (String broken : new String[] {"{깨진 값", "null", "[null]", "[{}]", "[{\"word\": \"나무\"}]"}) {
            when(values.get("dict:나무")).thenReturn(broken);
            assertThat(cache.get("나무")).as(broken).isEmpty();
        }
    }

    @Test
    void readFailureIsSkipped() {
        when(values.get(anyString())).thenThrow(new RedisConnectionFailureException("끊김"));
        assertThat(cache.get("나무")).isEmpty();
    }

    @Test
    void writeFailureIsSkipped() {
        doThrow(new RedisSystemException("OOM command not allowed when used memory > 'maxmemory'", null))
                .when(values)
                .set(anyString(), anyString(), any(Duration.class));
        assertThatCode(() -> cache.put("나무", items)).doesNotThrowAnyException();
    }
}
