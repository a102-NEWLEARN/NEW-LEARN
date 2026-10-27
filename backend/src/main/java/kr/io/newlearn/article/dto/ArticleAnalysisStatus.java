package kr.io.newlearn.article.dto;

import kr.io.newlearn.analysis.AnalysisJobStatus;

// NONE은 화면에만 쓰는 값이다. DB 작업 상태 enum에 넣지 않는다.
// NOT_ANALYZABLE 은 mindmapStatus 에만 나온다 — 결과가 없고 EXTRACT 가 INPUT_NOT_ANALYZABLE 로 실패했을 때 (api-internal.md 6절, Jira 30)
// NO_EVENT 는 eventMatchStatus 에만 나온다 — 판정 작업이 없고 마인드맵의 대표 사건이 비었을 때. 판정을 걸지 않는 기사 (Jira 56)
public enum ArticleAnalysisStatus {
    NONE,
    QUEUED,
    SUCCEEDED,
    FAILED,
    NOT_ANALYZABLE,
    NO_EVENT;

    static final String INPUT_NOT_ANALYZABLE = "INPUT_NOT_ANALYZABLE";

    public static ArticleAnalysisStatus from(AnalysisJobStatus status) {
        return status == null ? NONE : valueOf(status.name());
    }

    // 마인드맵 결과가 없을 때 EXTRACT 작업으로 계산한다. 결과가 있으면 부르는 쪽이 SUCCEEDED 로 둔다(다시 분석이 실패해도 옛 결과)
    // 그래서 NOT_ANALYZABLE 은 첫 분석에서만 나온다
    public static ArticleAnalysisStatus forMindmapWithoutResult(AnalysisJobStatus extract, String errorCode) {
        if (extract == AnalysisJobStatus.FAILED && INPUT_NOT_ANALYZABLE.equals(errorCode)) {
            return NOT_ANALYZABLE;
        }
        return from(extract);
    }
}
