package kr.io.newlearn.analysis;

import kr.io.newlearn.analysis.dto.JobResultRequest;

// 단계별 결과 저장 (docs/api-internal.md 5절). W1 이 작업 상태를 확인한 뒤 같은 트랜잭션 안에서 부른다
// EXTRACT 는 Jira 56, EMBED · MATCH_EVENT 는 Jira 35, ISSUE 는 Jira 40 이 구현했다
// 결과 모양이 틀리면 ResultSchemaInvalidException 을 던진다 — 이 트랜잭션은 되돌아가고 작업에는 RESULT_SCHEMA_INVALID 가 남는다
// (첫 시도면 바로 한 번 더 걸려 QUEUED, 두 번째면 FAILED). 그 밖의 예외는 INTERNAL 로 남는다
// 잠금 순서: W1 은 analysis_job 행을 먼저 잠근 채 이 메서드를 부르고, EXTRACT 성공이면 뒤에 article 행을 고친다(공개).
// 처리기 안에서 article 등 다른 행을 먼저 잠그는 쿼리를 쓰면 B1(article 행 → analysis_job)과 서로 기다릴 수 있다
// 결과는 맞는데 그사이 저장할 상태가 바뀌었으면 ResultConflictException 을 던진다 — 마찬가지로 되돌아가고 작업에는 JOB_STATE_CONFLICT 가
// 남아 바로 다시 걸린다(ISSUE, Jira 40). ApiException 을 던지면 작업은 그대로 QUEUED 다
public interface AnalysisResultHandler {

    AnalysisStage stage();

    void save(AnalysisJob job, JobResultRequest request);
}
