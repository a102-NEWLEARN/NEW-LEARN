package kr.io.newlearn.analysis;

import kr.io.newlearn.common.web.QueryText;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;

// W1 결과(봉투 · result)를 읽을 때 단계마다 같은 검사 — 맞지 않으면 ResultSchemaInvalidException(400, 한 번 다시, docs/api-internal.md 5절)
// U+0000 은 PostgreSQL text · jsonb 가 받지 않아 그대로 두면 저장에서 500 이 난다 — 받을 때 거절한다
// 오류 문구는 실패 기록(error_message)과 W1 응답의 detail 이 되므로 글자를 바꾸지 않는다
public final class ResultFields {

    private ResultFields() {}

    // 비거나 공백뿐이면 거절 — 화면에 그릴 글이다
    public static String text(JsonNode node, String field) {
        if (!node.isString() || node.stringValue().isBlank()) {
            throw invalid(field + " 이 비었다");
        }
        if (QueryText.containsNul(node.stringValue())) {
            throw invalid(field + " 에 U+0000 이 있다");
        }
        return node.stringValue();
    }

    // "3" 같은 글자 · 3.5 같은 소수는 거절한다
    public static long id(JsonNode node, String field) {
        if (!node.isInt() && !node.isLong()) {
            throw invalid(field + " 가 정수가 아니다: " + node);
        }
        return node.longValue();
    }

    // 봉투의 model · promptVersion — 비어 있으면 그대로 받고(null 로 남김) U+0000 만 거절한다
    public static void storableEnvelope(@Nullable String value, String field) {
        if (value != null && QueryText.containsNul(value)) {
            throw invalid("봉투의 " + field + " 에 U+0000 이 있다");
        }
    }

    public static boolean absent(JsonNode node) {
        return node.isMissingNode() || node.isNull();
    }

    public static ResultSchemaInvalidException invalid(String detail) {
        return new ResultSchemaInvalidException(detail);
    }
}
