package kr.io.newlearn.article.dto;

import kr.io.newlearn.analysis.AnalysisJobStatus;

// NONE은 화면에만 쓰는 값이다. DB 작업 상태 enum에 넣지 않는다.
public enum ArticleAnalysisStatus {
    NONE,
    QUEUED,
    SUCCEEDED,
    FAILED;

    public static ArticleAnalysisStatus from(AnalysisJobStatus status) {
        return status == null ? NONE : valueOf(status.name());
    }
}
