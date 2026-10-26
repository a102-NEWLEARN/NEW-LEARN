package kr.io.newlearn.analysis;

import kr.io.newlearn.analysis.dto.JobResultRequest;

// 단계별 결과 저장 (docs/api-internal.md 5절). W1 이 작업 상태를 확인한 뒤 같은 트랜잭션 안에서 부른다
// EXTRACT 는 Jira 56, EMBED · MATCH_EVENT 는 Jira 35, ISSUE 는 Jira 40 이 구현한다
// 결과 모양이 틀리면 ResultSchemaInvalidException 을 던진다 — 이 트랜잭션은 되돌아가고 작업은 FAILED 로 남는다
public interface AnalysisResultHandler {

    AnalysisStage stage();

    void save(AnalysisJob job, JobResultRequest request);
}
