package kr.io.newlearn.ingest.dto;

import java.util.List;
import kr.io.newlearn.analysis.AnalysisJob;
import kr.io.newlearn.analysis.AnalysisStage;

// B1 202 본문 — 건 작업들. 사람 · AI 가 시험할 때 W1 에 넣을 작업 ID 를 바로 보게 한다. 배치는 읽지 않아도 된다
// (docs/api-internal.md 2절, Jira 34)
public record ArticleReleaseResponse(long articleId, List<Job> jobs) {

    public record Job(long jobId, AnalysisStage stage, int attempt) {}

    public static ArticleReleaseResponse of(long articleId, List<AnalysisJob> jobs) {
        return new ArticleReleaseResponse(
                articleId,
                jobs.stream()
                        .map(job -> new Job(job.getId(), job.getStage(), job.getAttempt()))
                        .toList());
    }
}
