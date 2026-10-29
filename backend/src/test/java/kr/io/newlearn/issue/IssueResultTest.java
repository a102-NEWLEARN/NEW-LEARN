package kr.io.newlearn.issue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import kr.io.newlearn.analysis.ResultSchemaInvalidException;
import kr.io.newlearn.issue.IssueResult.Decision;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// W1 ISSUE 결과 읽기 · 검사 — docs/api-internal.md 5절 「API 가 ISSUE 결과를 받을 때」 (Jira 40)
// 후보에 있는 이슈 · 사건인지, 이번 사건이 들었는지는 작업의 candidates 를 봐야 해서 처리기가 본다(IssueStageIntegrationTest)
class IssueResultTest {

    static final JsonMapper JSON = JsonMapper.builder().build();

    static JsonNode json(String text) {
        return JSON.readTree(text);
    }

    // 맞지 않는 짝 칸(ATTACH 의 eventIds · issueTitle)은 읽지 않는다
    @Test
    void attachReadsTheIssueAndSummaryAndIgnoresTheRest() {
        var read = IssueResult.read(json("""
                {"decision": "ATTACH", "issueId": 3, "eventIds": "아무 값", "issueTitle": 5,
                 "issueSummary": "새 사건까지 넣은 요약", "reason": "같은 흐름이다"}"""));

        assertThat(read.decision()).isEqualTo(Decision.ATTACH);
        assertThat(read.issueId()).isEqualTo(3L);
        assertThat(read.eventIds()).isEmpty();
        assertThat(read.issueTitle()).isNull();
        assertThat(read.issueSummary()).isEqualTo("새 사건까지 넣은 요약");
        assertThat(read.reason()).isEqualTo("같은 흐름이다");
    }

    // 맞지 않는 짝 칸(CREATE 의 issueId)은 읽지 않는다. 사건 순서는 받은 그대로
    @Test
    void createReadsTheEventsTitleAndSummary() {
        var read = IssueResult.read(json("""
                {"decision": "CREATE", "issueId": "아무 값", "eventIds": [120, 97, 98],
                 "issueTitle": "부산 북항 상어 출몰", "issueSummary": "상어가 나타나 해경이 나섰다.", "reason": "한 흐름이다"}"""));

        assertThat(read.decision()).isEqualTo(Decision.CREATE);
        assertThat(read.issueId()).isNull();
        assertThat(read.eventIds()).containsExactly(120L, 97L, 98L);
        assertThat(read.issueTitle()).isEqualTo("부산 북항 상어 출몰");
        assertThat(read.issueSummary()).isEqualTo("상어가 나타나 해경이 나섰다.");
    }

    // NONE 은 까닭만 읽는다
    @Test
    void noneReadsOnlyTheReason() {
        var read = IssueResult.read(json("""
                {"decision": "NONE", "issueId": "x", "eventIds": 5, "issueTitle": "", "issueSummary": null,
                 "reason": "아직 묶을 사건이 없다"}"""));

        assertThat(read.decision()).isEqualTo(Decision.NONE);
        assertThat(read.issueId()).isNull();
        assertThat(read.eventIds()).isEmpty();
        assertThat(read.issueTitle()).isNull();
        assertThat(read.issueSummary()).isNull();
        assertThat(read.reason()).isEqualTo("아직 묶을 사건이 없다");
    }

    // 저장할 수 없는 결과는 거절한다 — 400 RESULT_SCHEMA_INVALID, 한 번 다시
    @ParameterizedTest
    @ValueSource(
            strings = {
                "[]",
                "{\"reason\": \"까닭\"}",
                "{\"decision\": \"attach\", \"issueId\": 3, \"issueSummary\": \"요약\", \"reason\": \"까닭\"}",
                "{\"decision\": \"MERGE\", \"reason\": \"까닭\"}",
                // ATTACH 의 issueId
                "{\"decision\": \"ATTACH\", \"issueSummary\": \"요약\", \"reason\": \"까닭\"}",
                "{\"decision\": \"ATTACH\", \"issueId\": \"3\", \"issueSummary\": \"요약\", \"reason\": \"까닭\"}",
                "{\"decision\": \"ATTACH\", \"issueId\": 3.5, \"issueSummary\": \"요약\", \"reason\": \"까닭\"}",
                // ATTACH 의 issueSummary
                "{\"decision\": \"ATTACH\", \"issueId\": 3, \"reason\": \"까닭\"}",
                "{\"decision\": \"ATTACH\", \"issueId\": 3, \"issueSummary\": \"  \", \"reason\": \"까닭\"}",
                "{\"decision\": \"ATTACH\", \"issueId\": 3, \"issueSummary\": \"요\\u0000약\", \"reason\": \"까닭\"}",
                // CREATE 의 eventIds
                "{\"decision\": \"CREATE\", \"issueTitle\": \"이름\", \"issueSummary\": \"요약\", \"reason\": \"까닭\"}",
                "{\"decision\": \"CREATE\", \"eventIds\": \"1,2,3\", \"issueTitle\": \"이름\", \"issueSummary\": \"요약\", \"reason\": \"까닭\"}",
                "{\"decision\": \"CREATE\", \"eventIds\": [1, \"2\", 3], \"issueTitle\": \"이름\", \"issueSummary\": \"요약\", \"reason\": \"까닭\"}",
                "{\"decision\": \"CREATE\", \"eventIds\": [1, 2.5, 3], \"issueTitle\": \"이름\", \"issueSummary\": \"요약\", \"reason\": \"까닭\"}",
                "{\"decision\": \"CREATE\", \"eventIds\": [1, 1, 2], \"issueTitle\": \"이름\", \"issueSummary\": \"요약\", \"reason\": \"까닭\"}",
                "{\"decision\": \"CREATE\", \"eventIds\": [1, 2], \"issueTitle\": \"이름\", \"issueSummary\": \"요약\", \"reason\": \"까닭\"}",
                // CREATE 의 이름 · 요약
                "{\"decision\": \"CREATE\", \"eventIds\": [1, 2, 3], \"issueTitle\": \" \", \"issueSummary\": \"요약\", \"reason\": \"까닭\"}",
                "{\"decision\": \"CREATE\", \"eventIds\": [1, 2, 3], \"issueTitle\": \"이\\u0000름\", \"issueSummary\": \"요약\", \"reason\": \"까닭\"}",
                "{\"decision\": \"CREATE\", \"eventIds\": [1, 2, 3], \"issueTitle\": \"이름\", \"reason\": \"까닭\"}",
                // 까닭
                "{\"decision\": \"NONE\"}",
                "{\"decision\": \"NONE\", \"reason\": \"\"}",
                "{\"decision\": \"NONE\", \"reason\": \"까\\u0000닭\"}"
            })
    void unstorableResultsAreRejected(String result) {
        assertThatThrownBy(() -> IssueResult.read(json(result))).isInstanceOf(ResultSchemaInvalidException.class);
    }
}
