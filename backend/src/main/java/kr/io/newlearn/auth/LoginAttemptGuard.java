package kr.io.newlearn.auth;

import java.time.Duration;
import java.util.List;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

// 로그인 실패 잠금 — 같은 아이디로 5번 연속 틀리면 1분 동안 로그인을 막는다 (Jira 62, 2026-10-26 사용자 결정)
// 없는 아이디도 똑같이 세서 「그 아이디가 있는지」를 드러내지 않는다. 횟수 · 잠금은 Redis 에 두어 API Pod 가 여럿이어도 같다
// 비밀번호를 맞춰 보기 전에 시도를 하나 예약한다 — 한꺼번에 몰려와도 맞춰 보는 것은 5번까지다(2026-10-26 리뷰)
@Component
public class LoginAttemptGuard {

    static final int MAX_FAILURES = 5;
    static final Duration LOCK = Duration.ofMinutes(1);
    // 마지막 시도 뒤 이만큼 지나면 센 횟수를 잊는다
    static final Duration REMEMBER_FAILURES = Duration.ofMinutes(10);

    // 잠겼으면 0. 아니면 횟수를 하나 올리고 몇 번째인지 준다. 5번을 넘으면(앞 시도들이 아직 맞춰 보는 중) 잠그고 0
    // 확인과 올리기를 Redis 안에서 한 번에 해서, 그 사이에 다른 요청이 끼어들지 못한다
    private static final RedisScript<Long> RESERVE = RedisScript.of("""
            if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
            local attempt = redis.call('INCR', KEYS[2])
            redis.call('PEXPIRE', KEYS[2], ARGV[1])
            if attempt > tonumber(ARGV[3]) then
              redis.call('SET', KEYS[1], 'locked', 'PX', ARGV[2])
              redis.call('DEL', KEYS[2])
              return 0
            end
            return attempt
            """, Long.class);

    private final StringRedisTemplate redis;

    public LoginAttemptGuard(StringRedisTemplate redis) {
        this.redis = redis;
    }

    // 몇 번째 시도인지(1 ~ 5). 0 이면 잠겨서 비밀번호를 맞춰 보지 않는다
    public long reserveAttempt(String loginId) {
        Long attempt = redis.execute(
                RESERVE,
                List.of(lockKey(loginId), failKey(loginId)),
                String.valueOf(REMEMBER_FAILURES.toMillis()),
                String.valueOf(LOCK.toMillis()),
                String.valueOf(MAX_FAILURES));
        return attempt == null ? 0 : attempt;
    }

    // 틀린 시도가 다섯 번째면 1분 잠그고 센 횟수는 지운다. 1분 뒤 잠금 키가 저절로 사라져 0부터 다시 센다
    public void recordFailure(String loginId, long attempt) {
        if (attempt >= MAX_FAILURES) {
            redis.opsForValue().set(lockKey(loginId), "locked", LOCK);
            redis.delete(failKey(loginId));
        }
    }

    public void recordSuccess(String loginId) {
        redis.delete(failKey(loginId));
    }

    static String failKey(String loginId) {
        return "login-fail:" + loginId;
    }

    static String lockKey(String loginId) {
        return "login-lock:" + loginId;
    }
}
