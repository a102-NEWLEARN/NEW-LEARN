package kr.io.newlearn.dictionary;

import java.time.Duration;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

// 문맥 뜻을 Redis 에 하루 둔다 — 같은 대상의 같은 말은 GMS 를 다시 부르지 않는다 (docs/api-screen.md A26, Jira 187)
// 같은 글의 같은 말은 처음 받은 답으로 하루 고정한다. 풀이 불가(Meaning.NONE)도 둔다 — 다시 불러도 같은 답이고 비용만 든다.
// 이 Redis 는 세션 · 작업 큐와 같아서 키마다 꼭 만료를 건다. 읽기 · 쓰기가 실패해도 막지 않는다(비용은 MeaningQuota 가 막는다).
// 검색 기록을 남기지 않으려고 로그에 말을 적지 않는다
@Component
class MeaningCache {

    private static final Logger log = LoggerFactory.getLogger(MeaningCache.class);

    static final Duration TTL = Duration.ofDays(1);

    private final StringRedisTemplate redis;
    private final JsonMapper jsonMapper;

    MeaningCache(StringRedisTemplate redis, JsonMapper jsonMapper) {
        this.redis = redis;
        this.jsonMapper = jsonMapper;
    }

    Optional<Meaning> get(String key) {
        String saved;
        try {
            saved = redis.opsForValue().get(key);
        } catch (DataAccessException e) {
            log.warn("Redis 에서 문맥 뜻을 읽지 못해 건너뛴다: {}", e.getClass().getSimpleName());
            return Optional.empty();
        }
        if (saved == null) {
            return Optional.empty();
        }
        try {
            Meaning meaning = jsonMapper.readValue(saved, Meaning.class);
            // 찾았다는데 칸이 비었으면(손으로 고친 값 등) 없는 것으로 본다
            if (meaning.found() && (meaning.word() == null || meaning.definition() == null)) {
                return Optional.empty();
            }
            return Optional.of(meaning);
        } catch (JacksonException e) {
            log.warn("Redis 에 둔 문맥 뜻을 읽지 못해 건너뛴다");
            return Optional.empty();
        }
    }

    void put(String key, Meaning meaning) {
        try {
            redis.opsForValue().set(key, jsonMapper.writeValueAsString(meaning), TTL);
        } catch (DataAccessException e) {
            log.warn("Redis 에 문맥 뜻을 두지 못해 건너뛴다: {}", e.getClass().getSimpleName());
        }
    }

    // 종류 · ID · 공백을 뺀 말 — 「금리 인상」과 줄바꿈으로 공백이 빠진 「금리인상」이 같은 키다
    static String key(MeaningTarget target, long id, String compactTerm) {
        return "meaning:" + target + ":" + id + ":" + compactTerm;
    }
}
