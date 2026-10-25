package kr.io.newlearn.article;

import java.util.List;
import java.util.stream.Collectors;
import kr.io.newlearn.analysis.AnalysisJobRepository;
import kr.io.newlearn.analysis.AnalysisStage;
import kr.io.newlearn.article.dto.ArticleAnalysisStatus;
import kr.io.newlearn.article.dto.ArticleSummaryResponse;
import kr.io.newlearn.article.dto.SummarySource;
import kr.io.newlearn.category.dto.CategoryRef;
import kr.io.newlearn.common.web.ApiTime;
import kr.io.newlearn.mindmap.ArticleMindmapRepository;
import org.springframework.stereotype.Component;

/** A7·A8 및 A6에서 재사용하는 요약 조립. 호출자는 press·category를 함께 조회하고 순서를 정한다. */
@Component
public class ArticleSummaryAssembler {
    private final ArticleMindmapRepository mindmaps;
    private final AnalysisJobRepository jobs;

    public ArticleSummaryAssembler(ArticleMindmapRepository mindmaps, AnalysisJobRepository jobs) {
        this.mindmaps = mindmaps;
        this.jobs = jobs;
    }

    public List<ArticleSummaryResponse> assemble(List<Article> articles) {
        if (articles.isEmpty()) return List.of();
        var ids = articles.stream().map(Article::getId).toList();
        var results = mindmaps.findSummariesByArticleIdIn(ids).stream()
                .collect(Collectors.toMap(ArticleMindmapRepository.SummaryView::getArticleId, r -> r));
        var states = jobs.findStatesByArticleIdInAndStage(ids, AnalysisStage.EXTRACT).stream()
                .collect(Collectors.toMap(
                        AnalysisJobRepository.StateView::getArticleId, AnalysisJobRepository.StateView::getStatus));
        return articles.stream()
                .map(article -> {
                    var result = results.get(article.getId());
                    String own = result == null ? null : result.getSummary();
                    String source = article.getSourceSummary();
                    String summary = present(own) ? own : present(source) ? source : null;
                    SummarySource summarySource =
                            present(own) ? SummarySource.NEWLEARN : present(source) ? SummarySource.NEWSDATA : null;
                    var category = article.getCategory();
                    return new ArticleSummaryResponse(
                            article.getId(),
                            article.getTitle(),
                            new ArticleSummaryResponse.PublisherRef(
                                    article.getPress().getCode(),
                                    article.getPress().getName()),
                            ApiTime.toKst(article.getPublishedAt()),
                            category == null ? null : new CategoryRef(category.getCode(), category.getName()),
                            summary,
                            summarySource,
                            article.getUrl(),
                            result != null
                                    ? ArticleAnalysisStatus.SUCCEEDED
                                    : ArticleAnalysisStatus.from(states.get(article.getId())));
                })
                .toList();
    }

    private boolean present(String value) {
        return value != null && !value.isBlank();
    }
}
