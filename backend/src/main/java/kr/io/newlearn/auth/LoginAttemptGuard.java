package kr.io.newlearn.auth;

import java.time.Duration;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

// 로그인 실패 잠금 — 같은 아이디로 5번 연속 틀리면 1분 동안 로그인을 막는다 (Jira 62, 2026-10-26 사용자 결정)
// 없는 아이디도 똑같이 세서 「그 아이디가 있는지」를 드러내지 않는다. 횟수 · 잠금은 Redis 에 두어 API Pod 가 여럿이어도 같다
@Component
public class LoginAttemptGuard {

    static final int MAX_FAILURES = 5;
    static final Duration LOCK = Duration.ofMinutes(1);
    // 마지막 실패 뒤 이만큼 지나면 센 횟수를 잊는다
    static final Duration REMEMBER_FAILURES = Duration.ofMinutes(10);

    private final StringRedisTemplate redis;

    public LoginAttemptGuard(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public boolean isLocked(String loginId) {
        return Boolean.TRUE.equals(redis.hasKey(lockKey(loginId)));
    }

    public void recordFailure(String loginId) {
        String failKey = failKey(loginId);
        Long failures = redis.opsForValue().increment(failKey);
        redis.expire(failKey, REMEMBER_FAILURES);
        if (failures != null && failures >= MAX_FAILURES) {
            redis.opsForValue().set(lockKey(loginId), "locked", LOCK);
            redis.delete(failKey);
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
