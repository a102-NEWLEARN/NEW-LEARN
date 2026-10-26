package kr.io.newlearn.ingest;

import kr.io.newlearn.ingest.dto.ArticleReleaseResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// B1 기사 투입 — 수집 배치만 부른다. 직원용 문이라 배치 출입증(X-Internal-Key)이 있어야 닿는다 (docs/api-internal.md 2절)
// 202 분석을 걸었다, 404 ARTICLE_NOT_FOUND, 409 ALREADY_RELEASED 이미 투입함(배치는 건너뛴다)
@RestController
@RequestMapping("/internal/v1/articles")
class ArticleReleaseInternalController {

    private final ArticleReleaseService releases;

    ArticleReleaseInternalController(ArticleReleaseService releases) {
        this.releases = releases;
    }

    @PostMapping("/{articleId}/release")
    ResponseEntity<ArticleReleaseResponse> release(@PathVariable long articleId) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(releases.release(articleId));
    }
}
