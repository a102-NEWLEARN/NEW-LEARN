package kr.io.newlearn.analysis;

import java.io.Serial;

// 결과는 맞는데 그사이 저장할 상태가 바뀌었다 — ISSUE 결과의 사건이 다른 이슈에 들어갔거나 고른 이슈가 없어짐 (docs/api-internal.md 5절)
// 처리기(AnalysisResultHandler)가 던지면 처리기가 쓴 것은 되돌리고, 작업은 JOB_STATE_CONFLICT 로 실패를 남긴 뒤 바로 다시 걸린다.
// W1 은 409 다 (Jira 40)
public class ResultConflictException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    public ResultConflictException(String detail) {
        super(detail);
    }
}
