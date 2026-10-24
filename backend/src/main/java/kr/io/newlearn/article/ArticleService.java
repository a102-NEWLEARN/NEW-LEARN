package kr.io.newlearn.article;

import java.util.List;
import kr.io.newlearn.analysis.AnalysisJobRepository;
import kr.io.newlearn.analysis.AnalysisStage;
import kr.io.newlearn.article.dto.ArticleAnalysisStatus;
import kr.io.newlearn.article.dto.ArticleDetailResponse;
import kr.io.newlearn.article.dto.ArticleSummaryResponse;
import kr.io.newlearn.category.CategoryRepository;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.NotFoundException;
import kr.io.newlearn.common.web.ApiTime;
import kr.io.newlearn.common.web.PageQuery;
import kr.io.newlearn.common.web.PageResponse;
import kr.io.newlearn.event.ArticleEventRepository;
import kr.io.newlearn.issue.dto.EventRef;
import kr.io.newlearn.issue.dto.IssueRef;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ArticleService {
    private final ArticleRepository articles;
    private final CategoryRepository categories;
    private final ArticleSummaryAssembler summaries;
    private final AnalysisJobRepository jobs;
    private final ArticleEventRepository links;

    public ArticleService(
            ArticleRepository articles,
            CategoryRepository categories,
            ArticleSummaryAssembler summaries,
            AnalysisJobRepository jobs,
            ArticleEventRepository links) {
        this.articles = articles;
        this.categories = categories;
        this.summaries = summaries;
        this.jobs = jobs;
        this.links = links;
    }

    public PageResponse<ArticleSummaryResponse> list(String category, PageQuery query) {
        if (category != null && !categories.existsById(category)) {
            throw new NotFoundException(ErrorCode.CATEGORY_NOT_FOUND, "카테고리를 찾을 수 없다: " + category);
        }
        var pageable = query.toPageable(Sort.by(Sort.Direction.DESC, "publishedAt", "id"));
        var page = category == null
                ? articles.findByReleasedAtIsNotNull(pageable)
                : articles.findByReleasedAtIsNotNullAndCategory_Code(category, pageable);
        return PageResponse.from(
                new PageImpl<>(summaries.assemble(page.getContent()), pageable, page.getTotalElements()));
    }

    public ArticleDetailResponse get(long articleId) {
        var article = articles.findByIdAndReleasedAtIsNotNull(articleId)
                .orElseThrow(() -> new NotFoundException(ErrorCode.ARTICLE_NOT_FOUND, "기사를 찾을 수 없다: " + articleId));
        var summary = summaries.assemble(List.of(article)).getFirst();
        var matchStatus = jobs.findStatesByArticleIdInAndStage(List.of(articleId), AnalysisStage.MATCH_EVENT).stream()
                .findFirst()
                .map(s -> ArticleAnalysisStatus.from(s.getStatus()))
                .orElse(ArticleAnalysisStatus.NONE);
        var link = links.findByArticleId(articleId);
        var event = link.map(l -> l.getEvent()).orElse(null);
        var issue = event == null ? null : event.getIssue();
        return new ArticleDetailResponse(
                summary,
                article.getReporter(),
                matchStatus,
                event == null
                        ? null
                        : new EventRef(
                                event.getId(),
                                event.getTitle(),
                                event.getLabel(),
                                ApiTime.toKst(event.getOccurredAt())),
                issue == null ? null : new IssueRef(issue.getId(), issue.getTitle()));
    }
}
