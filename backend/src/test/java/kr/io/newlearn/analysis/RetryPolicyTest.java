package kr.io.newlearn.analysis;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.stream.Stream;
import kr.io.newlearn.analysis.RetryPolicy.Kind;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

// 실패 코드 · 시도 번호 → 다시 걸지 · 언제 (docs/api.md 2절 「작업 실패 코드」, Jira 30)
class RetryPolicyTest {

    static Stream<Arguments> decisions() {
        return Stream.of(
                Arguments.of("LLM_TIMEOUT", 1, Kind.LATER, Duration.ofMinutes(1)),
                Arguments.of("LLM_TIMEOUT", 2, Kind.LATER, Duration.ofMinutes(5)),
                Arguments.of("LLM_TIMEOUT", 3, Kind.STOP, null),
                Arguments.of("LLM_RATE_LIMITED", 1, Kind.LATER, Duration.ofMinutes(5)),
                Arguments.of("LLM_RATE_LIMITED", 2, Kind.LATER, Duration.ofMinutes(15)),
                Arguments.of("LLM_UNAVAILABLE", 2, Kind.LATER, Duration.ofMinutes(15)),
                Arguments.of("LLM_UNAVAILABLE", 3, Kind.STOP, null),
                // 「한 번만 더」 — 시도 2 까지만
                Arguments.of("LLM_OUTPUT_INVALID", 1, Kind.LATER, Duration.ofMinutes(1)),
                Arguments.of("LLM_OUTPUT_INVALID", 2, Kind.STOP, null),
                Arguments.of("INTERNAL", 1, Kind.LATER, Duration.ofMinutes(1)),
                Arguments.of("INTERNAL", 2, Kind.STOP, null),
                Arguments.of("RESULT_SCHEMA_INVALID", 1, Kind.NOW, Duration.ZERO),
                Arguments.of("RESULT_SCHEMA_INVALID", 2, Kind.STOP, null),
                // 다시 걸지 않는 코드 · 모르는 코드 · 코드 없음
                Arguments.of("LLM_INPUT_TOO_LONG", 1, Kind.STOP, null),
                Arguments.of("LLM_REFUSED", 1, Kind.STOP, null),
                Arguments.of("INPUT_NOT_ANALYZABLE", 1, Kind.STOP, null),
                Arguments.of("SOMETHING_NEW", 1, Kind.STOP, null),
                Arguments.of(null, 1, Kind.STOP, null));
    }

    @ParameterizedTest
    @MethodSource("decisions")
    void decidesByCodeAndAttempt(String code, int attempt, Kind kind, Duration delay) {
        RetryPolicy.Decision decision = RetryPolicy.decide(code, attempt);
        assertThat(decision.kind()).isEqualTo(kind);
        assertThat(decision.delay()).isEqualTo(delay);
    }
}
