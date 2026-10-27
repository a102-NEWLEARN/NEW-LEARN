package kr.io.newlearn.analysis.embedding;

import kr.io.newlearn.analysis.AnalysisJob;
import kr.io.newlearn.analysis.AnalysisResultHandler;
import kr.io.newlearn.analysis.AnalysisStage;
import kr.io.newlearn.analysis.dto.JobResultRequest;
import org.springframework.stereotype.Component;

// W1 EMBED 결과를 기사 벡터로 저장한다 (Jira 35, docs/api-internal.md 5절)
// AnalysisJobService.receiveResult 가 작업 행을 잠근 트랜잭션 안에서 부른다. 기사 행은 잠그지 않는다
@Component
class EmbedResultHandler implements AnalysisResultHandler {

    private final EmbeddingStore embeddings;

    EmbedResultHandler(EmbeddingStore embeddings) {
        this.embeddings = embeddings;
    }

    @Override
    public AnalysisStage stage() {
        return AnalysisStage.EMBED;
    }

    @Override
    public void save(AnalysisJob job, JobResultRequest request) {
        // 성공인데 result 가 없으면 receiveResult 가 problem() 으로 먼저 거절했다
        var embed = EmbedResult.read(request.result());
        embeddings.save(job.getArticle().getId(), embed.model(), embed.vector());
    }
}
