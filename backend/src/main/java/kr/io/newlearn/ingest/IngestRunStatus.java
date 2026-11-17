package kr.io.newlearn.ingest;

// 수집 실행 한 번의 상태. RUNNING 으로 시작해 SUCCEEDED 나 FAILED 로 끝난다 (data-model.md 2절)
public enum IngestRunStatus {
    RUNNING,
    SUCCEEDED,
    FAILED
}
