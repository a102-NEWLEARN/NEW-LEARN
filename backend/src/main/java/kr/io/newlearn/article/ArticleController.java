package kr.io.newlearn.article;

import jakarta.validation.Valid;
import kr.io.newlearn.article.dto.ArticleDetailResponse;
import kr.io.newlearn.article.dto.ArticleSummaryResponse;
import kr.io.newlearn.common.web.PageQuery;
import kr.io.newlearn.common.web.PageResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ArticleController {
    private final ArticleService service;

    public ArticleController(ArticleService service) {
        this.service = service;
    }

    @GetMapping("/api/v1/articles")
    public PageResponse<ArticleSummaryResponse> list(
            @RequestParam(required = false) String category, @Valid PageQuery query) {
        return service.list(category, query);
    }

    @GetMapping("/api/v1/articles/{articleId}")
    public ArticleDetailResponse get(@PathVariable long articleId) {
        return service.get(articleId);
    }
}
