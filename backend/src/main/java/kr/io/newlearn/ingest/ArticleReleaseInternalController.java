package kr.io.newlearn.ingest;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.time.LocalDate;
import kr.io.newlearn.ingest.dto.ArticleReleaseResponse;
import kr.io.newlearn.ingest.dto.ReleaseCandidatesResponse;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// B1 기사 투입 · B3 자동 투입 판단 자료 — 수집 배치만 부른다. 직원용 문이라 배치 출입증(X-Internal-Key)이 있어야 닿는다 (docs/api-internal.md 2절)
// B1: 202 분석을 걸었다, 404 ARTICLE_NOT_FOUND, 409 ALREADY_RELEASED 이미 투입함(배치는 건너뛴다)
// B3: 200 오늘 건 수 · EXTRACT 상태 · 후보(읽기만), 400 VALIDATION_FAILED (Jira 156)
@RestController
@RequestMapping("/internal/v1/articles")
class ArticleReleaseInternalController {

    private final ArticleReleaseService releases;
    private final ReleaseCandidateQuery candidates;

    ArticleReleaseInternalController(ArticleReleaseService releases, ReleaseCandidateQuery candidates) {
        this.releases = releases;
        this.candidates = candidates;
    }

    @PostMapping("/{articleId}/release")
    ResponseEntity<ArticleReleaseResponse> release(@PathVariable long articleId) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(releases.release(articleId));
    }

    // publishedFrom: 후보 발행 KST 날짜의 시작(덤프 마감 다음 날). limit: 후보 몇 건 — 수집 배치의 회차 최대
    @GetMapping("/release-candidates")
    ReleaseCandidatesResponse releaseCandidates(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate publishedFrom,
            @RequestParam @Min(1) @Max(500) int limit) {
        return candidates.read(publishedFrom, limit);
    }
}
