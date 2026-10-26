package kr.io.newlearn.analysis;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;

// 실패한 분석 작업을 다시 걸지, 언제 걸지 (docs/api.md 2절 「작업 실패 코드」, Jira 30)
// 다시 걸지는 워커가 아니라 API 가 실패 코드와 시도 번호로 정한다. 최대 시도 수는 3(첫 시도 포함)이다
// 「한 번만 더」 코드는 시도 2 까지만. 여기 없는 코드(LLM_INPUT_TOO_LONG · LLM_REFUSED · INPUT_NOT_ANALYZABLE ·
// 모르는 코드)는 다시 걸지 않는다 — 모르는 실패를 계속 다시 걸면 GMS 예산만 쓴다
public final class RetryPolicy {

    public static final int MAX_ATTEMPTS = 3;

    public enum Kind {
        NOW, // 바로 다시 건다
        LATER, // delay 가 지난 뒤 스케줄러가 다시 건다
        STOP // 다시 걸지 않는다
    }

    public record Decision(Kind kind, Duration delay) {}

    // 코드 → 이 시도까지만 다시 건다, 시도 번호별 간격(1번째 실패 뒤, 2번째 실패 뒤)
    private record Rule(int lastAttempt, List<Duration> delays) {}

    private static final Map<String, Rule> RULES = Map.of(
            "LLM_TIMEOUT", new Rule(MAX_ATTEMPTS, List.of(Duration.ofMinutes(1), Duration.ofMinutes(5))),
            "LLM_RATE_LIMITED", new Rule(MAX_ATTEMPTS, List.of(Duration.ofMinutes(5), Duration.ofMinutes(15))),
            "LLM_UNAVAILABLE", new Rule(MAX_ATTEMPTS, List.of(Duration.ofMinutes(5), Duration.ofMinutes(15))),
            "LLM_OUTPUT_INVALID", new Rule(2, List.of(Duration.ofMinutes(1))),
            "INTERNAL", new Rule(2, List.of(Duration.ofMinutes(1))),
            // W1 에서 API 가 저장을 거절한 시도 — 바로 한 번만 더
            "RESULT_SCHEMA_INVALID", new Rule(2, List.of(Duration.ZERO)));

    private RetryPolicy() {}

    // attempt: 방금 실패한 시도 번호
    public static Decision decide(String errorCode, int attempt) {
        Rule rule = errorCode == null ? null : RULES.get(errorCode);
        if (rule == null || attempt >= rule.lastAttempt()) {
            return new Decision(Kind.STOP, null);
        }
        Duration delay = rule.delays().get(attempt - 1);
        return new Decision(delay.isZero() ? Kind.NOW : Kind.LATER, delay);
    }

    public static Set<String> retryableCodes() {
        return RULES.keySet();
    }
}
