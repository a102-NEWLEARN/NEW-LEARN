package kr.io.newlearn.dictionary;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import kr.io.newlearn.dictionary.dto.DictionaryItem;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

// 사전 결과를 Redis 에 하루 둔다 — 같은 단어는 사전을 다시 부르지 않는다 (docs/api-screen.md A19, 2026-10-29 사용자)
// 이 Redis 는 세션 · 작업 큐와 같아서 키마다 꼭 만료를 건다. 가득 차면(noeviction) 쓰기가 실패한다
// 저장 · 읽기가 실패해도 사전 검색은 막지 않는다 — 경고만 남기고 건너뛴다. 검색 기록을 남기지 않으려고 로그에 검색어를 적지 않는다
@Component
class DictionaryCache {

    private static final Logger log = LoggerFactory.getLogger(DictionaryCache.class);

    static final Duration TTL = Duration.ofDays(1);

    private final StringRedisTemplate redis;
    private final JsonMapper jsonMapper;

    DictionaryCache(StringRedisTemplate redis, JsonMapper jsonMapper) {
        this.redis = redis;
        this.jsonMapper = jsonMapper;
    }

    Optional<List<DictionaryItem>> get(String query) {
        String saved;
        try {
            saved = redis.opsForValue().get(key(query));
        } catch (DataAccessException e) {
            log.warn("Redis 에서 사전 결과를 읽지 못해 건너뛴다: {}", e.getClass().getSimpleName());
            return Optional.empty();
        }
        if (saved == null) {
            return Optional.empty();
        }
        DictionaryItem[] items;
        try {
            items = jsonMapper.readValue(saved, DictionaryItem[].class);
        } catch (JacksonException e) {
            items = null;
        }
        // 손으로 고친 값 · 칸 이름이 바뀌기 전의 옛 값(null · [null] · [{}])도 없는 것으로 본다
        if (items == null || Arrays.stream(items).anyMatch(DictionaryCache::broken)) {
            log.warn("Redis 에 둔 사전 결과를 읽지 못해 건너뛴다");
            return Optional.empty();
        }
        return Optional.of(List.of(items));
    }

    // JSON 에서 칸이 빠지면 record 의 칸이 null 로 채워진다
    private static boolean broken(@Nullable DictionaryItem item) {
        return item == null || item.word() == null || item.definition() == null;
    }

    void put(String query, List<DictionaryItem> items) {
        try {
            redis.opsForValue().set(key(query), jsonMapper.writeValueAsString(items), TTL);
        } catch (DataAccessException e) {
            log.warn("Redis 에 사전 결과를 두지 못해 건너뛴다: {}", e.getClass().getSimpleName());
        }
    }

    static String key(String query) {
        return "dict:" + query;
    }
}
