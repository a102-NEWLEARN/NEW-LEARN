package kr.io.newlearn.analysis;

// 작업 상태. 워커가 처리 시작을 알리지 않아서 「처리 중」을 따로 두지 않는다 (docs/api-internal.md 6절)
public enum AnalysisJobStatus {
    // 대기 또는 처리 중
    QUEUED,
    SUCCEEDED,
    FAILED
}
