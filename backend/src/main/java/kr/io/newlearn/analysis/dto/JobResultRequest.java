package kr.io.newlearn.analysis.dto;

import java.time.Instant;
import java.time.OffsetDateTime;
import kr.io.newlearn.common.web.QueryText;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;

// W1 봉투 — 모든 단계가 같은 봉투를 쓰고 result 만 단계마다 다르다 (docs/api-internal.md 5절)
// attempt 는 받은 메시지의 값 그대로. 지금 시도와 다르면 409 — 늦게 온 옛 결과가 새 결과를 덮지 않게
// model · promptVersion · result 를 어디에 저장할지는 단계별 처리기(AnalysisResultHandler)가 정한다
public record JobResultRequest(
        Integer attempt,
        Status status,
        String model,
        String promptVersion,
        OffsetDateTime startedAt,
        OffsetDateTime finishedAt,
        JsonNode result,
        JobError error) {

    public enum Status {
        SUCCEEDED,
        FAILED
    }

    public record JobError(String code, String message) {}

    // 봉투 안끼리 맞지 않는 곳. 맞으면 null
    public @Nullable String problem() {
        if (status == null) {
            return "status 가 없다";
        }
        if (status == Status.SUCCEEDED && (result == null || result.isNull())) {
            return "SUCCEEDED 인데 result 가 없다";
        }
        if (status == Status.SUCCEEDED && error != null) {
            return "SUCCEEDED 인데 error 가 있다";
        }
        if (status == Status.FAILED
                && (error == null || error.code() == null || error.code().isBlank())) {
            return "FAILED 인데 error.code 가 없다";
        }
        // 실패 기록(error_code · error_message)에 그대로 남기면 PostgreSQL 이 받지 않아 500 이었다 (Jira 143)
        if (status == Status.FAILED
                && (QueryText.containsNul(error.code())
                        || (error.message() != null && QueryText.containsNul(error.message())))) {
            return "FAILED 인데 error 에 U+0000 이 있다";
        }
        return null;
    }

    public Instant startedAtOr(Instant fallback) {
        return startedAt == null ? fallback : startedAt.toInstant();
    }

    public Instant finishedAtOr(Instant fallback) {
        return finishedAt == null ? fallback : finishedAt.toInstant();
    }
}
