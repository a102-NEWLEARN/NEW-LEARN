package kr.io.newlearn.analysis;

import kr.io.newlearn.analysis.dto.JobResultRequest;

// 단계별 결과 저장 (docs/api-internal.md 5절). W1 이 작업 상태를 확인한 뒤 같은 트랜잭션 안에서 부른다
// EXTRACT 는 Jira 56, EMBED · MATCH_EVENT 는 Jira 35, ISSUE 는 Jira 40 이 구현한다
// 결과 모양이 틀리면 ResultSchemaInvalidException 을 던진다 — 이 트랜잭션은 되돌아가고 작업에는 RESULT_SCHEMA_INVALID 가 남는다
// (첫 시도면 바로 한 번 더 걸려 QUEUED, 두 번째면 FAILED). 그 밖의 예외는 INTERNAL 로 남는다
// ApiException(예: ISSUE 의 409)을 던지면 작업은 그대로 QUEUED 다 — 다시 거는 일까지 하려면 Jira 40 이 receiveResult 를 넓힌다
public interface AnalysisResultHandler {

    AnalysisStage stage();

    void save(AnalysisJob job, JobResultRequest request);
}
