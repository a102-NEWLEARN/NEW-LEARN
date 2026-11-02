package kr.io.newlearn.issue;

import static kr.io.newlearn.analysis.ResultFields.id;
import static kr.io.newlearn.analysis.ResultFields.invalid;
import static kr.io.newlearn.analysis.ResultFields.text;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;

// W1 ISSUE 결과(봉투의 result) — docs/api-internal.md 5절 (Jira 40)
// 저장할 수 없으면 거절한다(400, 한 번 다시). 맞지 않는 짝 칸(ATTACH 의 eventIds · issueTitle, CREATE 의 issueId, NONE 의 나머지)은
// 읽지 않는다. 고른 이슈 · 사건이 보낸 후보 안인지, 이번 사건이 들었는지는 작업의 candidates 를 봐야 해서 처리기(IssueResultHandler)가 본다
// issueId 는 ATTACH 일 때만, eventIds · issueTitle 은 CREATE 일 때만, issueSummary 는 ATTACH · CREATE 일 때만 채운다
public record IssueResult(
        Decision decision,
        @Nullable Long issueId,
        List<Long> eventIds,
        @Nullable String issueTitle,
        @Nullable String issueSummary,
        String reason) {

    public enum Decision {
        ATTACH,
        CREATE,
        NONE
    }

    // 새 이슈는 사건 3개가 모이면 만든다 — 이번 사건 포함 (2026-10-20 팀 회의)
    static final int MIN_EVENTS = 3;

    public static IssueResult read(JsonNode result) {
        if (!result.isObject()) {
            throw invalid("result 가 객체가 아니다");
        }
        var reason = text(result.path("reason"), "reason");
        var decision = result.path("decision");
        if (!decision.isString()) {
            throw invalid("decision 이 없다");
        }
        return switch (decision.stringValue()) {
            case "ATTACH" ->
                new IssueResult(
                        Decision.ATTACH,
                        id(result.path("issueId"), "issueId"),
                        List.of(),
                        null,
                        text(result.path("issueSummary"), "issueSummary"),
                        reason);
            case "CREATE" ->
                new IssueResult(
                        Decision.CREATE,
                        null,
                        eventIds(result.path("eventIds")),
                        text(result.path("issueTitle"), "issueTitle"),
                        text(result.path("issueSummary"), "issueSummary"),
                        reason);
            case "NONE" -> new IssueResult(Decision.NONE, null, List.of(), null, null, reason);
            // 받은 글자는 JSON 노드로 찍는다(U+0000 이 \u0000 으로 이스케이프된다). 날것으로 붙이면 이 문구를 실패 기록
            // (error_message)에 넣다 DB 가 거절해 400 이 아니라 500 이 된다 — MatchEventResult 와 같다
            default -> throw invalid("decision 이 ATTACH · CREATE · NONE 이 아니다: " + decision);
        };
    }

    // 받은 순서 그대로. 같은 사건이 두 번이면 「사건 3개」를 셀 수 없어 거절한다
    private static List<Long> eventIds(JsonNode eventIds) {
        if (!eventIds.isArray()) {
            throw invalid("CREATE 인데 eventIds 가 배열이 아니다");
        }
        List<Long> ids = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        for (JsonNode node : eventIds) {
            long id = id(node, "eventIds 의 값");
            if (!seen.add(id)) {
                throw invalid("eventIds 에 같은 사건이 두 번 있다: " + id);
            }
            ids.add(id);
        }
        if (ids.size() < MIN_EVENTS) {
            throw invalid("새 이슈의 사건이 " + MIN_EVENTS + "개가 안 된다: " + ids.size());
        }
        return List.copyOf(ids);
    }
}
