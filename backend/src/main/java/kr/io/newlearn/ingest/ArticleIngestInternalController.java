package kr.io.newlearn.ingest;

import jakarta.validation.Valid;
import kr.io.newlearn.ingest.dto.ArticleIngestRequest;
import kr.io.newlearn.ingest.dto.ArticleIngestResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// B2 기사 적재 — 수집 배치만 부른다. 직원용 문이라 배치 출입증(X-Internal-Key)이 있어야 닿는다 (docs/api-internal.md 2절, Jira 153)
// 201 새로 넣음, 200 같은 URL 의 기사가 이미 있음(그 id), 400 VALIDATION_FAILED. 배치는 201 · 200 모두 그 id 로 B1 을 부른다
@RestController
@RequestMapping("/internal/v1/articles")
class ArticleIngestInternalController {

    private final ArticleIngestService ingests;

    ArticleIngestInternalController(ArticleIngestService ingests) {
        this.ingests = ingests;
    }

    @PostMapping
    ResponseEntity<ArticleIngestResponse> ingest(@Valid @RequestBody ArticleIngestRequest request) {
        ArticleIngestResponse response = ingests.ingest(request);
        return ResponseEntity.status(response.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(response);
    }
}
