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
import kr.io.newlearn.mindmap.ArticleMindmapRepository;
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
    private final ArticleMindmapRepository mindmaps;

    public ArticleService(
            ArticleRepository articles,
            CategoryRepository categories,
            ArticleSummaryAssembler summaries,
            AnalysisJobRepository jobs,
            ArticleEventRepository links,
            ArticleMindmapRepository mindmaps) {
        this.articles = articles;
        this.categories = categories;
        this.summaries = summaries;
        this.jobs = jobs;
        this.links = links;
        this.mindmaps = mindmaps;
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
                .orElseGet(() -> withoutMatchJob(articleId));
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

    // 판정 작업이 없을 때 — 마인드맵이 있는데 대표 사건이 비었으면 판정을 걸지 않는 기사(NO_EVENT),
    // 그 밖에는 아직 걸지 않음(NONE, EXTRACT · EMBED 를 기다리는 중) (api-internal.md 6절, Jira 56)
    private ArticleAnalysisStatus withoutMatchJob(long articleId) {
        return mindmaps.findById(articleId)
                .filter(mindmap -> mindmap.getPrimaryCoreIndex() == null)
                .map(mindmap -> ArticleAnalysisStatus.NO_EVENT)
                .orElse(ArticleAnalysisStatus.NONE);
    }
}
