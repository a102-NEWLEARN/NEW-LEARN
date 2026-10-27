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

    // A8 의 NO_EVENT — 마인드맵은 있는데 대표 사건이 비었나 (Jira 56). jsonb 칸까지 읽지 않으려고 있는지만 묻는다
    boolean existsByArticleIdAndPrimaryCoreIndexIsNull(Long articleId);
}
