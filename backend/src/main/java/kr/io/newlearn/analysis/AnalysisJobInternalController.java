package kr.io.newlearn.analysis;

import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import kr.io.newlearn.analysis.dto.JobResultRequest;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.ProblemDetails;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// W1 결과 전달 — AI 워커만 부른다. 직원용 문이라 워커 출입증(X-Internal-Key)이 있어야 닿는다 (docs/api-internal.md 5절)
// 204 저장, 400 RESULT_SCHEMA_INVALID 형식이 틀림, 404 ANALYSIS_JOB_NOT_FOUND, 409 JOB_STATE_CONFLICT 끝난 작업 · 다른 시도
@RestController
@RequestMapping("/internal/v1/analysis-jobs")
class AnalysisJobInternalController {

    private final AnalysisJobService service;

    AnalysisJobInternalController(AnalysisJobService service) {
        this.service = service;
    }

    @PostMapping("/{jobId}/result")
    ResponseEntity<Void> receiveResult(@PathVariable long jobId, @RequestBody JobResultRequest request) {
        service.receiveResult(jobId, request);
        return ResponseEntity.noContent().build();
    }

    // 봉투를 JSON 으로 못 읽었다(모르는 status 값 · 깨진 JSON). 시도 번호를 몰라 작업은 건드리지 않는다
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ProblemDetail> unreadable(HttpServletRequest request) {
        ProblemDetail problem = ProblemDetails.of(ErrorCode.RESULT_SCHEMA_INVALID, "결과 봉투를 읽지 못했다");
        problem.setInstance(URI.create(request.getRequestURI()));
        return ResponseEntity.status(problem.getStatus()).body(problem);
    }
}
