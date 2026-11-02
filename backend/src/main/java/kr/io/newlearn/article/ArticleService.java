package kr.io.newlearn.article;

import java.util.List;
import kr.io.newlearn.analysis.AnalysisJobRepository;
import kr.io.newlearn.analysis.AnalysisStage;
import kr.io.newlearn.article.dto.ArticleAnalysisStatus;
import kr.io.newlearn.article.dto.ArticleDetailResponse;
import kr.io.newlearn.article.dto.ArticleSummaryResponse;
import kr.io.newlearn.category.CategoryRepository;
import kr.io.newlearn.common.web.PageQuery;
import kr.io.newlearn.common.web.PageResponse;
import kr.io.newlearn.event.ArticleEventRepository;
import kr.io.newlearn.issue.dto.EventRef;
import kr.io.newlearn.issue.dto.IssueRef;
import kr.io.newlearn.mindmap.ArticleMindmapRepository;
import org.jspecify.annotations.Nullable;
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

    // memberId 는 세션 회원, 손님이면 null — bookmarked 칸을 회원 기준으로 채운다. 손님용 짧은 판을 두지 않는 것은
    // 회원 요청에서 그것을 잘못 부르면 bookmarked 가 조용히 false 가 되기 때문이다
    public PageResponse<ArticleSummaryResponse> list(
            @Nullable String category, PageQuery query, @Nullable Long memberId) {
        categories.checkFilter(category);
        var pageable = query.toPageable(Sort.by(Sort.Direction.DESC, "publishedAt", "id"));
        var page = category == null
                ? articles.findByReleasedAtIsNotNull(pageable)
                : articles.findByReleasedAtIsNotNullAndCategory_Code(category, pageable);
        return PageResponse.of(page, summaries.assemble(page.getContent(), memberId));
    }

    public ArticleDetailResponse get(long articleId, @Nullable Long memberId) {
        var article = articles.getReleased(articleId);
        var summary = summaries.assemble(List.of(article), memberId).getFirst();
        var link = links.findByArticleId(articleId);
        var matchStatus = jobs.findStatesByArticleIdInAndStage(List.of(articleId), AnalysisStage.MATCH_EVENT).stream()
                .findFirst()
                .map(s -> ArticleAnalysisStatus.from(s.getStatus()))
                .orElseGet(() -> withoutMatchJob(articleId, link.isPresent()));
        var event = link.map(l -> l.getEvent()).orElse(null);
        var issue = event == null ? null : event.getIssue();
        return new ArticleDetailResponse(
                summary,
                article.getReporter(),
                matchStatus,
                event == null ? null : EventRef.from(event),
                issue == null ? null : IssueRef.from(issue));
    }

    // 판정 작업이 없을 때 — 사건에 묶이지 않았고 마인드맵의 대표 사건이 비었으면 판정을 걸지 않는 기사(NO_EVENT),
    // 그 밖에는 아직 걸지 않음(NONE, EXTRACT · EMBED 를 기다리는 중) (api-internal.md 6절, Jira 56)
    // 사건에 묶였는데 판정 작업이 없는 것은 손으로 넣은 데이터뿐이다 — 그때도 「묶을 사건 없음」으로 보이지 않게
    private ArticleAnalysisStatus withoutMatchJob(long articleId, boolean linked) {
        if (!linked && mindmaps.existsByArticleIdAndPrimaryCoreIndexIsNull(articleId)) {
            return ArticleAnalysisStatus.NO_EVENT;
        }
        return ArticleAnalysisStatus.NONE;
    }
}
