package kr.io.newlearn.event;

import kr.io.newlearn.analysis.ResultSchemaInvalidException;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;

// W1 MATCH_EVENT 결과(봉투의 result) — docs/api-internal.md 5절 (Jira 35, 사건 역할 Jira 130)
// 저장할 수 없으면 거절한다(400, 한 번 다시). 맞지 않는 짝 칸(EXISTING 의 newEvent, NEW 의 eventId)은 읽지 않는다.
// eventId 가 보낸 후보 안인지는 작업의 candidates 를 봐야 해서 처리기(MatchEventResultHandler)가 본다
// eventId 는 EXISTING 일 때만, newEvent 는 NEW 일 때만 채운다
public record MatchEventResult(
        Decision decision, @Nullable Long eventId, @Nullable NewEvent newEvent, String reason) {

    public enum Decision {
        EXISTING,
        NEW
    }

    // 사건 이름 · 키워드 · 요약 · 역할 · 반응 대상. 길이는 프롬프트로 맞추고 API 는 막지 않는다(넘치면 화면이 줄임표로 자름)
    // reactsTo 는 REACTION 일 때만 채운다
    public record NewEvent(
            String title,
            String label,
            String summary,
            EventRole role,
            @Nullable String reactsTo) {}

    public static MatchEventResult read(JsonNode result) {
        if (!result.isObject()) {
            throw invalid("result 가 객체가 아니다");
        }
        var reason = text(result.path("reason"), "reason");
        var decision = result.path("decision");
        if (!decision.isString()) {
            throw invalid("decision 이 없다");
        }
        return switch (decision.stringValue()) {
            case "EXISTING" -> new MatchEventResult(Decision.EXISTING, eventId(result.path("eventId")), null, reason);
            case "NEW" -> new MatchEventResult(Decision.NEW, null, newEvent(result.path("newEvent")), reason);
            // 받은 글자는 JSON 노드로 찍는다(U+0000 이 \u0000 으로 이스케이프된다). 날것으로 붙이면 이 문구를 실패 기록
            // (error_message)에 넣다 DB 가 거절해 400 이 아니라 500 이 된다
            default -> throw invalid("decision 이 EXISTING · NEW 가 아니다: " + decision);
        };
    }

    // "97" 같은 글자 · 97.5 같은 소수는 거절한다
    private static long eventId(JsonNode eventId) {
        if (!eventId.isInt() && !eventId.isLong()) {
            throw invalid("EXISTING 인데 eventId 가 정수가 아니다: " + eventId);
        }
        return eventId.longValue();
    }

    private static NewEvent newEvent(JsonNode newEvent) {
        if (!newEvent.isObject()) {
            throw invalid("NEW 인데 newEvent 가 없다");
        }
        var role = role(newEvent.path("role"));
        return new NewEvent(
                text(newEvent.path("title"), "newEvent.title"),
                text(newEvent.path("label"), "newEvent.label"),
                text(newEvent.path("summary"), "newEvent.summary"),
                role,
                role == EventRole.REACTION ? keptOrNull(newEvent.path("reactsTo")) : null);
    }

    // 역할을 모르면 타임라인 레인을 정할 수 없어 거절한다. 값 목록은 대문자라 소문자 · 레인 이름(SUB)도 거절 (docs/api.md 1절)
    private static EventRole role(JsonNode role) {
        return switch (role.isString() ? role.stringValue() : "") {
            case "MAIN" -> EventRole.MAIN;
            case "REACTION" -> EventRole.REACTION;
            default -> throw invalid("newEvent.role 이 MAIN · REACTION 이 아니다: " + role);
        };
    }

    // 반응 대상 한 줄은 화면 API 로 내보내지 않는 칸이라, 담을 수 없으면(글자가 아님 · 공백뿐 · U+0000) 거절하지 않고 버린다.
    // 거절하면 판정을 다시 걸어 GMS 를 한 번 더 부른다
    private static @Nullable String keptOrNull(JsonNode node) {
        if (!node.isString()
                || node.stringValue().isBlank()
                || node.stringValue().indexOf('\u0000') >= 0) {
            return null;
        }
        return node.stringValue();
    }

    // 비거나 공백뿐이면 거절. U+0000 은 PostgreSQL text · jsonb 가 받지 않아 저장에서 500 이 나므로 거절 — EXTRACT 와 같은 기준
    private static String text(JsonNode node, String field) {
        if (!node.isString() || node.stringValue().isBlank()) {
            throw invalid(field + " 이 비었다");
        }
        if (node.stringValue().indexOf('\u0000') >= 0) {
            throw invalid(field + " 에 U+0000 이 있다");
        }
        return node.stringValue();
    }

    private static ResultSchemaInvalidException invalid(String detail) {
        return new ResultSchemaInvalidException(detail);
    }
}
