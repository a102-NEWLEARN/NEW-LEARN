package kr.io.newlearn.ingest;

import kr.io.newlearn.analysis.AnalysisJobRepository;
import kr.io.newlearn.analysis.AnalysisJobService;
import kr.io.newlearn.article.Article;
import kr.io.newlearn.article.ArticleRepository;
import kr.io.newlearn.common.error.ApiException;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.NotFoundException;
import kr.io.newlearn.ingest.dto.ArticleReleaseResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 기사 투입(B1) — 적재해 둔 기사에 분석을 건다 (docs/api-internal.md 2절, Jira 34)
// 화면에 내놓는 일(released_at)은 여기서 하지 않는다. 기사는 분석이 끝난 뒤부터 보인다 —
// EXTRACT 결과를 처음 저장할 때 AnalysisJobService 가 공개한다(2026-10-26 사용자)
@Service
public class ArticleReleaseService {

    private final ArticleRepository articles;
    private final AnalysisJobRepository jobs;
    private final AnalysisJobService analysis;

    public ArticleReleaseService(ArticleRepository articles, AnalysisJobRepository jobs, AnalysisJobService analysis) {
        this.articles = articles;
        this.jobs = jobs;
        this.analysis = analysis;
    }

    // 기사 행을 잠그고 본다 — 같은 기사 투입 둘이 동시에 와도 뒤에 온 쪽은 앞 쪽이 만든 작업을 보고 409 다
    @Transactional
    public ArticleReleaseResponse release(long articleId) {
        Article article = articles.findForUpdate(articleId)
                .orElseThrow(() -> new NotFoundException(ErrorCode.ARTICLE_NOT_FOUND, "기사가 없다: " + articleId));
        if (article.getReleasedAt() != null || jobs.existsByArticle_Id(articleId)) {
            throw new ApiException(ErrorCode.ALREADY_RELEASED, "이미 투입한 기사다: " + articleId);
        }
        return ArticleReleaseResponse.of(articleId, analysis.queueRelease(article));
    }
}
