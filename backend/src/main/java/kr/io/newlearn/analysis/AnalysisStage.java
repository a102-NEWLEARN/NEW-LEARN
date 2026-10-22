package kr.io.newlearn.analysis;

// 분석 단계 넷 (docs/api-internal.md). 주장 추출(F09)은 추후 논의라 값이 없다
public enum AnalysisStage {
    // 기사 핵심 정보 추출 — 가지 4개 마인드맵
    EXTRACT,
    // 임베딩
    EMBED,
    // 동일 사건 판정
    MATCH_EVENT,
    // 이슈에 붙이기 · 새 이슈 만들기 (제안)
    ISSUE
}
