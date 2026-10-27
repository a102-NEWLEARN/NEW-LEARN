package kr.io.newlearn.mindmap.dto;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import kr.io.newlearn.analysis.ResultSchemaInvalidException;
import kr.io.newlearn.mindmap.MindmapContent;
import kr.io.newlearn.mindmap.MindmapContent.Branch;
import kr.io.newlearn.mindmap.MindmapContent.BranchType;
import kr.io.newlearn.mindmap.MindmapContent.Evidence;
import kr.io.newlearn.mindmap.MindmapContent.Item;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;

// W1 EXTRACT 결과(봉투의 result) — docs/api-internal.md 5절 (Jira 56)
// 읽으면서 검사한다. 화면을 그릴 수 없으면 거절하고(400, 한 번 다시 건다), 버려도 화면이 같으면 고쳐서 받는다
// 근거가 본문에 있는지는 여기서 보지 않는다 — 본문이 필요해서 처리기가 MindmapContent.retainEvidence 로 본다
public record ExtractResult(
        @Nullable String summary,
        String schemaVersion,
        MindmapContent mindmap,
        @Nullable Integer primaryCoreIndex,
        @Nullable Instant occurredAt,
        int malformedEvidence) {

    public static final String SCHEMA_VERSION = "mindmap-v1";

    public static ExtractResult read(JsonNode result) {
        return new Reader().read(result);
    }

    // 모양이 틀린 근거 수를 세면서 읽는다
    private static final class Reader {

        private int malformedEvidence;

        ExtractResult read(JsonNode result) {
            if (!result.isObject()) {
                throw invalid("result 가 객체가 아니다");
            }
            var schemaVersion = result.path("schemaVersion");
            if (!schemaVersion.isString() || !SCHEMA_VERSION.equals(schemaVersion.stringValue())) {
                throw invalid("schemaVersion 이 " + SCHEMA_VERSION + " 이 아니다");
            }
            var summary = result.path("summary");
            if (!absent(summary) && !summary.isString()) {
                throw invalid("summary 가 문자열이 아니다");
            }
            var mindmap = result.path("mindmap");
            if (!mindmap.isObject()) {
                throw invalid("mindmap 이 없다");
            }
            // 가운데 글자는 비어도 화면이 기사 제목을 쓴다 — 모양이 틀리면 버린다
            var title = mindmap.path("title");
            var content = new MindmapContent(
                    title.isString() ? storable(title.stringValue(), "mindmap.title") : null, branches(mindmap));
            var primaryCoreIndex = primaryCoreIndex(result.path("primaryCoreIndex"), content);
            // 대표 사건이 없으면 그 시점도 없다 — 온 값은 읽지 않는다
            var occurredAt = primaryCoreIndex == null ? null : occurredAt(result.path("occurredAt"));
            return new ExtractResult(
                    summary.isString() ? storable(summary.stringValue(), "summary") : null,
                    SCHEMA_VERSION,
                    content,
                    primaryCoreIndex,
                    occurredAt,
                    malformedEvidence);
        }

        private List<Branch> branches(JsonNode mindmap) {
            var node = mindmap.path("branches");
            if (!node.isArray() || node.size() == 0) {
                throw invalid("mindmap.branches 가 비었다");
            }
            var seen = EnumSet.noneOf(BranchType.class);
            var branches = new ArrayList<Branch>();
            for (var branch : node.values()) {
                var type = type(branch.path("type"));
                if (!seen.add(type)) {
                    throw invalid("같은 가지가 두 번 왔다: " + type);
                }
                branches.add(new Branch(type, items(type, branch.path("items"))));
            }
            // 순서만 다르면 다시 부를 일이 아니라 표 순서로 줄 세운다
            branches.sort(Comparator.comparing(Branch::type));
            return List.copyOf(branches);
        }

        private static BranchType type(JsonNode node) {
            if (node.isString()) {
                for (var type : BranchType.values()) {
                    if (type.name().equals(node.stringValue())) {
                        return type;
                    }
                }
            }
            throw invalid("모르는 가지 종류다: " + node);
        }

        private List<Item> items(BranchType type, JsonNode node) {
            if (!node.isArray() || node.size() == 0) {
                throw invalid(type + " 가지의 items 가 비었다");
            }
            var items = new ArrayList<Item>();
            for (var item : node.values()) {
                var text = item.path("text");
                if (!text.isString() || text.stringValue().isBlank()) {
                    throw invalid(type + " 가지 " + items.size() + "번 잎의 text 가 비었다");
                }
                items.add(new Item(storable(text.stringValue(), type + " 가지 잎"), evidence(item.path("evidence"))));
            }
            return List.copyOf(items);
        }

        // 모양이 틀린 근거는 그 근거만 버리고 센다 — 본문과 맞지 않는 근거를 지우는 것과 같은 규칙
        private List<Evidence> evidence(JsonNode node) {
            if (absent(node)) {
                return List.of();
            }
            if (!node.isArray()) {
                malformedEvidence++;
                return List.of();
            }
            var evidence = new ArrayList<Evidence>();
            for (var one : node.values()) {
                var text = one.path("text");
                var paragraphIndex = one.path("paragraphIndex");
                var sentenceIndex = one.path("sentenceIndex");
                if (text.isString() && paragraphIndex.isInt() && sentenceIndex.isInt()) {
                    evidence.add(new Evidence(text.stringValue(), paragraphIndex.intValue(), sentenceIndex.intValue()));
                } else {
                    malformedEvidence++;
                }
            }
            return List.copyOf(evidence);
        }

        // CORE 가지 잎 중 몇 번째인가(0부터). 범위 밖이거나 CORE 가지 없이 오면 거절 (api-internal.md 5절)
        private static @Nullable Integer primaryCoreIndex(JsonNode node, MindmapContent content) {
            if (absent(node)) {
                return null;
            }
            if (!node.isInt()) {
                throw invalid("primaryCoreIndex 가 정수가 아니다: " + node);
            }
            var core = content.branches().stream()
                    .filter(branch -> branch.type() == BranchType.CORE)
                    .findFirst()
                    .orElseThrow(() -> invalid("CORE 가지 없이 primaryCoreIndex 가 왔다"));
            var index = node.intValue();
            if (index < 0 || index >= core.items().size()) {
                throw invalid("primaryCoreIndex " + index + " 가 CORE 잎 "
                        + core.items().size() + "개 밖이다");
            }
            return index;
        }

        private static @Nullable Instant occurredAt(JsonNode node) {
            if (absent(node)) {
                return null;
            }
            OffsetDateTime at;
            try {
                at = OffsetDateTime.parse(node.isString() ? node.stringValue() : "");
            } catch (DateTimeParseException e) {
                throw invalid("occurredAt 을 시각으로 읽지 못했다: " + node);
            }
            // PostgreSQL timestamptz 보다 넓게 읽혀서(+300000년 등) 그대로 두면 저장 때 500 이다
            if (at.getYear() < 1 || at.getYear() > 9999) {
                throw invalid("occurredAt 의 연도가 1 ~ 9999 밖이다: " + node);
            }
            return at.toInstant();
        }

        // PostgreSQL 의 text · jsonb 는 U+0000 을 받지 않는다 — 그대로 두면 저장(커밋) 때 500 이다
        private static String storable(String value, String field) {
            if (value.indexOf('\u0000') >= 0) {
                throw invalid(field + " 에 DB 에 넣을 수 없는 글자(U+0000)가 있다");
            }
            return value;
        }

        private static boolean absent(JsonNode node) {
            return node.isMissingNode() || node.isNull();
        }

        private static ResultSchemaInvalidException invalid(String detail) {
            return new ResultSchemaInvalidException(detail);
        }
    }
}
