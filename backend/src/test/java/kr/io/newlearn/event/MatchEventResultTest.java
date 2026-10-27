package kr.io.newlearn.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.stream.Stream;
import kr.io.newlearn.analysis.ResultSchemaInvalidException;
import kr.io.newlearn.event.MatchEventResult.Decision;
import kr.io.newlearn.event.MatchEventResult.NewEvent;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// W1 MATCH_EVENT 결과 읽기 · 검사 — docs/api-internal.md 5절 「MATCH_EVENT 결과」 (Jira 35)
// 후보에 있는 사건인지는 작업의 candidates 를 봐야 해서 처리기가 본다(EventMatchIntegrationTest)
class MatchEventResultTest {

    static final JsonMapper JSON = JsonMapper.builder().build();

    static JsonNode json(String text) {
        return JSON.readTree(text);
    }

    // 맞지 않는 짝 칸(EXISTING 의 newEvent)은 읽지 않는다
    @Test
    void existingReadsTheEventIdAndIgnoresNewEvent() {
        var read = MatchEventResult.read(json("""
                {"decision": "EXISTING", "eventId": 97, "reason": "같은 착공식이다",
                 "newEvent": {"title": "", "label": null, "summary": 3}}"""));

        assertThat(read.decision()).isEqualTo(Decision.EXISTING);
        assertThat(read.eventId()).isEqualTo(97L);
        assertThat(read.newEvent()).isNull();
        assertThat(read.reason()).isEqualTo("같은 착공식이다");
    }

    // 맞지 않는 짝 칸(NEW 의 eventId)은 읽지 않는다
    @Test
    void newReadsTheNewEventAndIgnoresEventId() {
        var read = MatchEventResult.read(json("""
                {"decision": "NEW", "eventId": "아무 값", "reason": "후보와 다른 사건이다",
                 "newEvent": {"title": "한빛반도체 텍사스 공장 착공식", "label": "착공식", "summary": "6일 착공식을 열었다."}}"""));

        assertThat(read.decision()).isEqualTo(Decision.NEW);
        assertThat(read.eventId()).isNull();
        assertThat(read.newEvent()).isEqualTo(new NewEvent("한빛반도체 텍사스 공장 착공식", "착공식", "6일 착공식을 열었다."));
    }

    static Stream<Arguments> rejected() {
        String newEvent = "\"newEvent\": {\"title\": \"이름\", \"label\": \"착공식\", \"summary\": \"요약\"}";
        return Stream.of(
                Arguments.of("result 가 객체가 아님", "[]"),
                Arguments.of("decision 없음", "{\"reason\": \"까닭\", \"eventId\": 97}"),
                Arguments.of("모르는 decision", "{\"decision\": \"MAYBE\", \"reason\": \"까닭\", \"eventId\": 97}"),
                Arguments.of("decision 소문자", "{\"decision\": \"existing\", \"reason\": \"까닭\", \"eventId\": 97}"),
                Arguments.of("EXISTING 인데 eventId 없음", "{\"decision\": \"EXISTING\", \"reason\": \"까닭\"}"),
                Arguments.of(
                        "EXISTING 인데 eventId null",
                        "{\"decision\": \"EXISTING\", \"reason\": \"까닭\", \"eventId\": null}"),
                Arguments.of(
                        "EXISTING 인데 eventId 가 글자",
                        "{\"decision\": \"EXISTING\", \"reason\": \"까닭\", \"eventId\": \"97\"}"),
                Arguments.of(
                        "EXISTING 인데 eventId 가 소수",
                        "{\"decision\": \"EXISTING\", \"reason\": \"까닭\", \"eventId\": 97.5}"),
                Arguments.of("NEW 인데 newEvent 없음", "{\"decision\": \"NEW\", \"reason\": \"까닭\"}"),
                Arguments.of(
                        "NEW 인데 title 이 공백",
                        "{\"decision\": \"NEW\", \"reason\": \"까닭\", \"newEvent\": {\"title\": \" \", \"label\": \"착공식\", \"summary\": \"요약\"}}"),
                Arguments.of(
                        "NEW 인데 label 없음",
                        "{\"decision\": \"NEW\", \"reason\": \"까닭\", \"newEvent\": {\"title\": \"이름\", \"summary\": \"요약\"}}"),
                Arguments.of(
                        "NEW 인데 summary null",
                        "{\"decision\": \"NEW\", \"reason\": \"까닭\", \"newEvent\": {\"title\": \"이름\", \"label\": \"착공식\", \"summary\": null}}"),
                Arguments.of("reason 없음", "{\"decision\": \"NEW\", " + newEvent + "}"),
                Arguments.of("reason 이 빈 글자", "{\"decision\": \"NEW\", \"reason\": \"\", " + newEvent + "}"),
                // PostgreSQL text · jsonb 가 받지 않아 그대로 두면 저장에서 500 — EXTRACT 와 같은 기준(api-internal.md 5절)
                Arguments.of("reason 에 U+0000", "{\"decision\": \"NEW\", \"reason\": \"까\\u0000닭\", " + newEvent + "}"),
                Arguments.of(
                        "title 에 U+0000",
                        "{\"decision\": \"NEW\", \"reason\": \"까닭\", \"newEvent\": {\"title\": \"이\\u0000름\", \"label\": \"착공식\", \"summary\": \"요약\"}}"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("rejected")
    void rejectsWhatCannotBeSaved(String why, String result) {
        assertThatThrownBy(() -> MatchEventResult.read(json(result))).isInstanceOf(ResultSchemaInvalidException.class);
    }
}
