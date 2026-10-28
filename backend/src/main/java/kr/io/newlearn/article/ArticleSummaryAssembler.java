package kr.io.newlearn.article;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import kr.io.newlearn.analysis.AnalysisJobRepository;
import kr.io.newlearn.analysis.AnalysisStage;
import kr.io.newlearn.article.dto.ArticleAnalysisStatus;
import kr.io.newlearn.article.dto.ArticleSummaryResponse;
import kr.io.newlearn.bookmark.BookmarkRepository;
import kr.io.newlearn.category.dto.CategoryRef;
import kr.io.newlearn.common.web.ApiTime;
import kr.io.newlearn.mindmap.ArticleMindmapRepository;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

/** A7·A8 및 A6에서 재사용하는 요약 조립. 호출자는 press·category를 함께 조회하고 순서를 정한다. */
@Component
public class ArticleSummaryAssembler {
    private final ArticleMindmapRepository mindmaps;
    private final AnalysisJobRepository jobs;
    private final BookmarkRepository bookmarks;

    public ArticleSummaryAssembler(
            ArticleMindmapRepository mindmaps, AnalysisJobRepository jobs, BookmarkRepository bookmarks) {
        this.mindmaps = mindmaps;
        this.jobs = jobs;
        this.bookmarks = bookmarks;
    }

    public List<ArticleSummaryResponse> assemble(List<Article> articles) {
        return assemble(articles, null);
    }

    public List<ArticleSummaryResponse> assemble(List<Article> articles, @Nullable Long memberId) {
        if (articles.isEmpty()) return List.of();
        var ids = articles.stream().map(Article::getId).toList();
        Set<Long> bookmarked = memberId == null ? Set.of() : new HashSet<>(bookmarks.findArticleIds(memberId, ids));
        return assembleWithBookmarks(articles, bookmarked);
    }

    // A22는 첫 조회의 북마크 상태를 쓴다. 재조회 사이 동시 해제가 일어나도 목록에는 true를 반환한다.
    public List<ArticleSummaryResponse> assembleWithBookmarks(List<Article> articles, Set<Long> bookmarked) {
        if (articles.isEmpty()) return List.of();
        var ids = articles.stream().map(Article::getId).toList();
        var results = mindmaps.findSummariesByArticleIdIn(ids).stream()
                .collect(Collectors.toMap(ArticleMindmapRepository.SummaryView::getArticleId, r -> r));
        var states = jobs.findStatesByArticleIdInAndStage(ids, AnalysisStage.EXTRACT).stream()
                .collect(Collectors.toMap(AnalysisJobRepository.StateView::getArticleId, s -> s));
        return articles.stream()
                .map(article -> {
                    var result = results.get(article.getId());
                    String own = result == null ? null : result.getSummary();
                    String summary = present(own) ? own : null;
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
                            article.getUrl(),
                            result != null
                                    ? ArticleAnalysisStatus.SUCCEEDED
                                    : mindmapStatusWithoutResult(states.get(article.getId())),
                            bookmarked.contains(article.getId()));
                })
                .toList();
    }

    private static ArticleAnalysisStatus mindmapStatusWithoutResult(AnalysisJobRepository.@Nullable StateView extract) {
        return extract == null
                ? ArticleAnalysisStatus.NONE
                : ArticleAnalysisStatus.forMindmapWithoutResult(extract.getStatus(), extract.getErrorCode());
    }

    private boolean present(@Nullable String value) {
        return value != null && !value.isBlank();
    }
}
