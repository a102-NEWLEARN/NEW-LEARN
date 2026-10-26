package kr.io.newlearn.common.web;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import kr.io.newlearn.common.error.FieldErrorItem;

// Swagger 에 보일 오류 본문의 모양 — 문서에만 쓴다. 실제 본문은 common.error.ProblemDetails 가 만든다
// Spring ProblemDetail 을 그대로 문서에 쓰면 code · errors 가 빠지고 쓰지 않는 칸(type · properties)이 보인다
@Schema(name = "Problem", description = "오류 응답 — RFC 9457 Problem Details 에 code · errors 를 더한 모양 (docs/api.md 1 · 2절)")
public record ApiProblem(
        @Schema(description = "HTTP 상태 이름", example = "Bad Request")
        String title,

        @Schema(description = "HTTP 상태 코드", example = "400") int status,
        @Schema(description = "개발자용 설명. 화면에 그대로 보이지 않는다") String detail,

        @Schema(description = "요청 주소", example = "/api/v1/articles")
        String instance,

        @Schema(description = "오류 코드. 화면은 이 값으로 갈라 처리한다", example = "VALIDATION_FAILED")
        String code,

        @Schema(description = "VALIDATION_FAILED 일 때만 — 어느 칸이 왜 틀렸나. reason 은 화면에 그대로 보일 한국어 문장")
        List<FieldErrorItem> errors) {}
