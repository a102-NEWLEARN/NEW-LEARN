package kr.io.newlearn.dictionary;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

// 문맥 뜻(A26) 하루 한도 — GMS 를 부르려 한 수를 한국 날짜로 세어 한도를 넘으면 부르지 않는다 (docs/api-screen.md A26, Jira 187)
// GMS 는 팀 공용 예산이라 이 한도가 비용의 상한이다(한 번 세면 GmsMeaningClient 가 빠른 실패에 한 번 더 불러 GMS 호출은 최대 2번).
// 그래서 사전 한도(DictionaryQuota)와 달리 세지 못하면(Redis 실패) 막는다.
// 한도 0 은 GMS 호출을 끄는 스위치다(사이트는 backend.yaml 의 MEANING_DAILY_LIMIT). 저장해 둔 답은 세지 않는다
@Component
class MeaningQuota {

    private static final Logger log = LoggerFactory.getLogger(MeaningQuota.class);

    private final StringRedisTemplate redis;
    private final long dailyLimit;
    private final Clock clock;

    @Autowired
    MeaningQuota(StringRedisTemplate redis, @Value("${newlearn.dictionary.meaning.daily-limit}") long dailyLimit) {
        this(redis, dailyLimit, Clock.system(DictionaryQuota.KST));
    }

    MeaningQuota(StringRedisTemplate redis, long dailyLimit, Clock clock) {
        this.redis = redis;
        this.dailyLimit = dailyLimit;
        this.clock = clock;
    }

    // GMS 를 한 번 부르려 할 때마다 센다. 한도 안이면 true
    boolean tryTake() {
        if (dailyLimit <= 0) {
            return false;
        }
        Long used;
        try {
            used = redis.execute(
                    DictionaryQuota.TAKE,
                    List.of(key(LocalDate.now(clock.withZone(DictionaryQuota.KST)))),
                    String.valueOf(DictionaryQuota.KEEP.toMillis()));
        } catch (DataAccessException e) {
            log.warn(
                    "Redis 에서 문맥 뜻 하루 호출 수를 세지 못해 GMS 를 부르지 않는다: {}",
                    e.getClass().getSimpleName());
            return false;
        }
        if (used == null) {
            return false;
        }
        if (used > dailyLimit) {
            if (used == dailyLimit + 1) {
                log.warn("문맥 뜻 하루 호출 수가 한도({})를 넘어 오늘은 GMS 를 부르지 않는다", dailyLimit);
            }
            return false;
        }
        return true;
    }

    // 사전 한도 키(dictquota:) · 저장 키(meaning:)와 섞이지 않게 앞머리를 다르게 둔다
    static String key(LocalDate day) {
        return "meaningquota:" + day;
    }
}
