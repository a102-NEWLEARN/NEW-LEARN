package kr.io.newlearn.ingest.dto;

import java.time.OffsetDateTime;
import java.util.List;
import org.jspecify.annotations.Nullable;

// B3 자동 투입 판단 자료 200 본문 (docs/api-internal.md 2절, Jira 156)
// 수집 배치가 회차마다 읽어 몫 = min(회차 최대, 하루 상한 − releasedToday, 대기 상한 − queued − retryPending)을 계산한다
// 세는 법은 AI 팀장 쿼리(infra/server/b1-state.sql)와 같다
public record ReleaseCandidatesResponse(long releasedToday, Extract extract, List<Candidate> candidates) {

    // EXTRACT 만 센다 — EMBED 는 워커를 꺼 둬서 늘 대기다
    public record Extract(
            long queued,
            long retryPending,
            @Nullable OffsetDateTime oldestQueuedAt,
            long succeededLast15Minutes,
            long failedLast15Minutes) {}

    public record Candidate(long articleId, OffsetDateTime publishedAt) {}
}
