package kr.io.newlearn.mindmap;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ArticleMindmapRepository extends JpaRepository<ArticleMindmap, Long> {
    interface SummaryView {
        Long getArticleId();

        String getSummary();
    }

    @Query(
            "select m.articleId as articleId, m.summary as summary from ArticleMindmap m where m.articleId in :articleIds")
    List<SummaryView> findSummariesByArticleIdIn(Collection<Long> articleIds);
}
