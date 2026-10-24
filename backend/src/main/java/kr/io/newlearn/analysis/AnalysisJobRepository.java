package kr.io.newlearn.analysis;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface AnalysisJobRepository extends JpaRepository<AnalysisJob, Long> {
    interface StateView {
        Long getArticleId();

        AnalysisJobStatus getStatus();
    }

    @Query(
            "select j.article.id as articleId, j.status as status from AnalysisJob j where j.article.id in :articleIds and j.stage = :stage")
    List<StateView> findStatesByArticleIdInAndStage(Collection<Long> articleIds, AnalysisStage stage);
}
