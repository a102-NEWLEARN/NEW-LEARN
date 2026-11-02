package kr.io.newlearn.mindmap;

import kr.io.newlearn.article.ArticleRepository;
import kr.io.newlearn.article.ReleasedArticles;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.NotFoundException;
import kr.io.newlearn.common.web.ApiTime;
import kr.io.newlearn.mindmap.dto.MindmapResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

// A9 기사 마인드맵 조회 (Jira 56). 저장은 ExtractResultHandler 가 한다
@Service
@Transactional(readOnly = true)
public class MindmapService {
    private final ArticleRepository articles;
    private final ArticleMindmapRepository mindmaps;
    private final JsonMapper jsonMapper;

    public MindmapService(ArticleRepository articles, ArticleMindmapRepository mindmaps, JsonMapper jsonMapper) {
        this.articles = articles;
        this.mindmaps = mindmaps;
        this.jsonMapper = jsonMapper;
    }

    public MindmapResponse get(long articleId) {
        // 공개 전 기사는 결과가 있어도 없는 기사로 본다 — A8 과 같다 (docs/api.md 1절)
        var article = ReleasedArticles.get(articles, articleId);
        var mindmap = mindmaps.findById(articleId)
                .orElseThrow(() -> new NotFoundException(ErrorCode.MINDMAP_NOT_FOUND, "마인드맵이 없다: " + articleId));
        return MindmapResponse.of(
                articleId,
                mindmap.getSchemaVersion(),
                ApiTime.toKst(mindmap.getGeneratedAt()),
                article.getTitle(),
                jsonMapper.readValue(mindmap.getContent(), MindmapContent.class));
    }
}
