package kr.io.newlearn.mindmap.dto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.stream.Stream;
import kr.io.newlearn.analysis.ResultSchemaInvalidException;
import kr.io.newlearn.mindmap.MindmapContent.BranchType;
import kr.io.newlearn.mindmap.MindmapContent.Evidence;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// W1 EXTRACT 결과 읽기 · 검사 — docs/api-internal.md 5절 「EXTRACT 결과」 · 「명세에 없던 경우」 (Jira 56)
class ExtractResultTest {

    static final JsonMapper JSON = JsonMapper.builder().build();

    static JsonNode json(String text) {
        return JSON.readTree(text);
    }

    // 가지 · 대표 사건 번호 · 시점만 바꿔 끼우는 결과
    static String result(String branches, String primaryCoreIndex, String occurredAt) {
        return """
                {"summary": "요약", "schemaVersion": "mindmap-v1",
                 "mindmap": {"title": null, "branches": %s},
                 "primaryCoreIndex": %s, "occurredAt": %s}
                """.formatted(branches, primaryCoreIndex, occurredAt);
    }

    static final String CORE_TWO = """
            {"type": "CORE", "items": [{"text": "착공식을 열었다"}, {"text": "양산은 그대로다"}]}""";

    @Test
    void readsAllFields() {
        var read = ExtractResult.read(json("""
                {"summary": "공장 착공", "schemaVersion": "mindmap-v1",
                 "mindmap": {"title": null, "branches": [
                   {"type": "CORE", "items": [
                     {"text": "착공식을 열었다", "evidence": [{"text": "6일 착공식을 열었다", "paragraphIndex": 0, "sentenceIndex": 1}]},
                     {"text": "양산은 그대로다"}]},
                   {"type": "OUTLOOK", "items": [{"text": "2028년 양산"}]}]},
                 "primaryCoreIndex": 0, "occurredAt": "2026-10-06T00:00:00+09:00"}
                """));

        assertThat(read.summary()).isEqualTo("공장 착공");
        assertThat(read.schemaVersion()).isEqualTo("mindmap-v1");
        assertThat(read.primaryCoreIndex()).isZero();
        assertThat(read.occurredAt()).isEqualTo(Instant.parse("2026-10-05T15:00:00Z"));
        assertThat(read.malformedEvidence()).isZero();
        var mindmap = read.mindmap();
        assertThat(mindmap.title()).isNull();
        assertThat(mindmap.branches()).extracting(b -> b.type()).containsExactly(BranchType.CORE, BranchType.OUTLOOK);
        var core = mindmap.branches().getFirst();
        assertThat(core.items()).extracting(i -> i.text()).containsExactly("착공식을 열었다", "양산은 그대로다");
        assertThat(core.items().getFirst().evidence()).containsExactly(new Evidence("6일 착공식을 열었다", 0, 1));
        assertThat(core.items().get(1).evidence()).isEmpty();
    }

    @Test
    void optionalFieldsMayBeAbsent() {
        var read = ExtractResult.read(json("""
                {"schemaVersion": "mindmap-v1", "mindmap": {"branches": [{"type": "CAUSE", "items": [{"text": "보조금 조건"}]}]}}
                """));

        assertThat(read.summary()).isNull();
        assertThat(read.mindmap().title()).isNull();
        assertThat(read.primaryCoreIndex()).isNull();
        assertThat(read.occurredAt()).isNull();
    }

    @Test
    void branchesAreSortedIntoTableOrder() {
        var read = ExtractResult.read(json(result("""
                [{"type": "OUTLOOK", "items": [{"text": "전망"}]},
                 {"type": "REACTION", "items": [{"text": "반응"}]},
                 {"type": "CORE", "items": [{"text": "핵심"}]},
                 {"type": "CAUSE", "items": [{"text": "배경"}]}]""", "null", "null")));

        assertThat(read.mindmap().branches())
                .extracting(b -> b.type())
                .containsExactly(BranchType.CORE, BranchType.CAUSE, BranchType.REACTION, BranchType.OUTLOOK);
    }

    @Test
    void malformedEvidenceIsDroppedAndCountedButTheLeafStays() {
        var read = ExtractResult.read(json(result("""
                [{"type": "CORE", "items": [
                  {"text": "잎 하나", "evidence": [
                    {"text": "맞는 모양", "paragraphIndex": 0, "sentenceIndex": 0},
                    {"text": "문단 번호 없음", "sentenceIndex": 0},
                    {"text": 3, "paragraphIndex": 0, "sentenceIndex": 0},
                    "글자만"]},
                  {"text": "잎 둘", "evidence": "배열이 아님"}]}]""", "null", "null")));

        var items = read.mindmap().branches().getFirst().items();
        assertThat(items).extracting(i -> i.text()).containsExactly("잎 하나", "잎 둘");
        assertThat(items.getFirst().evidence()).containsExactly(new Evidence("맞는 모양", 0, 0));
        assertThat(items.get(1).evidence()).isEmpty();
        assertThat(read.malformedEvidence()).isEqualTo(4);
    }

    @Test
    void nonStringTitleIsDropped() {
        var read = ExtractResult.read(json("""
                {"schemaVersion": "mindmap-v1", "mindmap": {"title": 3, "branches": [%s]}}""".formatted(CORE_TWO)));

        assertThat(read.mindmap().title()).isNull();
    }

    @Test
    void occurredAtIsDroppedWithoutPrimaryCore() {
        var read = ExtractResult.read(json(result("[" + CORE_TWO + "]", "null", "\"2026-10-06T00:00:00+09:00\"")));

        assertThat(read.occurredAt()).isNull();
    }

    static Stream<Arguments> rejected() {
        return Stream.of(
                Arguments.of("결과가 객체가 아님", "[]"),
                Arguments.of("schemaVersion 없음", """
                        {"mindmap": {"branches": [%s]}}""".formatted(CORE_TWO)),
                Arguments.of("모르는 schemaVersion", """
                        {"schemaVersion": "mindmap-v2", "mindmap": {"branches": [%s]}}""".formatted(CORE_TWO)),
                Arguments.of("mindmap 없음", """
                        {"schemaVersion": "mindmap-v1"}"""),
                Arguments.of("가지가 빔", result("[]", "null", "null")),
                Arguments.of("모르는 가지 종류", result("""
                        [{"type": "FUTURE", "items": [{"text": "잎"}]}]""", "null", "null")),
                Arguments.of("같은 가지 두 번", result("[" + CORE_TWO + ", " + CORE_TWO + "]", "null", "null")),
                Arguments.of("잎이 빔", result("""
                        [{"type": "CORE", "items": []}]""", "null", "null")),
                Arguments.of("잎 글자가 공백뿐", result("""
                        [{"type": "CORE", "items": [{"text": "  "}]}]""", "null", "null")),
                Arguments.of("대표 사건 번호가 잎 수 밖", result("[" + CORE_TWO + "]", "2", "null")),
                Arguments.of("대표 사건 번호가 음수", result("[" + CORE_TWO + "]", "-1", "null")),
                Arguments.of("CORE 가지 없이 번호", result("""
                        [{"type": "CAUSE", "items": [{"text": "배경"}]}]""", "0", "null")),
                Arguments.of("번호가 정수가 아님", result("[" + CORE_TWO + "]", "\"0\"", "null")),
                Arguments.of("시점을 시각으로 못 읽음", result("[" + CORE_TWO + "]", "0", "\"지난달\"")),
                // DB 가 받지 못하는 값 — 그대로 두면 저장(커밋) 때 500 이 된다 (리뷰, 2026-10-27)
                Arguments.of("시점 연도가 9999 밖", result("[" + CORE_TWO + "]", "0", "\"+300000-01-01T00:00:00+09:00\"")),
                Arguments.of("잎 글자에 NUL", result("""
                        [{"type": "CORE", "items": [{"text": "잎\\u0000"}]}]""", "null", "null")),
                Arguments.of("요약에 NUL", """
                        {"summary": "요약\\u0000", "schemaVersion": "mindmap-v1", "mindmap": {"branches": [%s]}}""".formatted(CORE_TWO)),
                Arguments.of("가운데 글자에 NUL", """
                        {"schemaVersion": "mindmap-v1", "mindmap": {"title": "제목\\u0000", "branches": [%s]}}""".formatted(CORE_TWO)),
                Arguments.of("요약이 문자열이 아님", """
                        {"summary": 3, "schemaVersion": "mindmap-v1", "mindmap": {"branches": [%s]}}""".formatted(CORE_TWO)));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("rejected")
    void rejectsWhatTheScreenCannotDraw(String why, String result) {
        assertThatThrownBy(() -> ExtractResult.read(json(result))).isInstanceOf(ResultSchemaInvalidException.class);
    }
}
