package kr.io.newlearn.analysis;

import org.jspecify.annotations.Nullable;

// analysis_job.result 의 모양(MATCH_EVENT · ISSUE) — 잘못 묶인 사건을 찾고 프롬프트 버전끼리 비교할 때 쓴다.
// 칸 이름 · 순서가 jsonb 에 저장되는 모양이라 바꾸지 않는다
public record Judgment(
        String reason, @Nullable String model, @Nullable String promptVersion) {}
