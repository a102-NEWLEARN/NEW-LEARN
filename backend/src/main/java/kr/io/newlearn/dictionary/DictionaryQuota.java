package kr.io.newlearn.dictionary;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

// 사전 하루 한도 — 표준국어대사전 Open API 는 하루 50,000건까지다. 앱이 부르려 한 수를 세어 한도(사이트 45,000)를 넘으면
// 부르지 않는다 (docs/api-screen.md A19, Jira 135, 2026-10-29 사용자). 한 사람이 IP 를 바꿔 가며 불러도 하루 한도는 지킨다.
// 부르기 직전에 세서 사전이 오류를 준 부름도 한 번이다. 사전 쪽 「하루」가 몇 시에 바뀌는지는 미확인이라 한국 자정으로 둔다 —
// 경계가 다르면 사전 쪽 하루 하나에 우리 이틀 몫이 걸칠 수 있어, 한도의 90% 여유가 이 경계까지 막지는 못한다
// 횟수는 Redis 에 두어 API Pod 가 여럿이어도 같다. 세지 못하면(Redis 실패) 막지 않고 부른다 — 안전장치일 뿐이다
@Component
class DictionaryQuota {

    private static final Logger log = LoggerFactory.getLogger(DictionaryQuota.class);

    static final ZoneId KST = ZoneId.of("Asia/Seoul");
    // 이 Redis 는 세션 · 작업 큐와 같아서 키마다 꼭 만료를 건다. 날짜가 바뀐 뒤에도 하루는 남겨 둔다
    static final Duration KEEP = Duration.ofDays(2);

    // 하나 올리고 몇 번째인지 준다. 만료가 없으면(처음 만든 키) 건다 — 올리기와 만료를 Redis 안에서 한 번에 한다
    private static final RedisScript<Long> TAKE = RedisScript.of("""
            local used = redis.call('INCR', KEYS[1])
            if redis.call('PTTL', KEYS[1]) < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
            return used
            """, Long.class);

    private final StringRedisTemplate redis;
    private final long dailyLimit;
    private final Clock clock;

    // 한도 값은 application.yaml 한 곳에만 둔다
    @Autowired
    DictionaryQuota(StringRedisTemplate redis, @Value("${newlearn.dictionary.daily-limit}") long dailyLimit) {
        this(redis, dailyLimit, Clock.system(KST));
    }

    // 시험이 자정 앞뒤 시각을 고정해 한국 날짜로 세는지 본다
    DictionaryQuota(StringRedisTemplate redis, long dailyLimit, Clock clock) {
        this.redis = redis;
        this.dailyLimit = dailyLimit;
        this.clock = clock;
    }

    // 사전을 한 번 부르려 할 때마다 센다. 한도 안이면 true
    boolean tryTake() {
        Long used;
        try {
            used = redis.execute(
                    TAKE, List.of(key(LocalDate.now(clock.withZone(KST)))), String.valueOf(KEEP.toMillis()));
        } catch (DataAccessException e) {
            log.warn("Redis 에서 사전 하루 호출 수를 세지 못해 세지 않고 부른다: {}", e.getClass().getSimpleName());
            return true;
        }
        if (used != null && used > dailyLimit) {
            // 넘은 첫 번째만 남긴다 — 넘은 뒤 부름마다 남기면 로그가 쌓인다
            if (used == dailyLimit + 1) {
                log.warn("사전 하루 호출 수가 한도({})를 넘어 오늘은 사전을 부르지 않는다", dailyLimit);
            }
            return false;
        }
        return true;
    }

    // 검색어 키(dict:)와 섞이지 않게 앞머리를 다르게 둔다
    static String key(LocalDate day) {
        return "dictquota:" + day;
    }
}
