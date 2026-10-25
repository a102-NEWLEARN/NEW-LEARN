package kr.io.newlearn.common.error;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

// 오류 응답의 code (docs/api.md 2절). 화면 · 워커는 HTTP 상태보다 이 값으로 갈라 처리한다
// 2절 표의 코드를 처음부터 모두 둔다. 기능 티켓마다 따로 더하면 두 사람이 같은 파일을 고쳐 머지가 부딪친다
public enum ErrorCode {

    // 화면용 · 공통
    VALIDATION_FAILED(HttpStatus.BAD_REQUEST),
    CATEGORY_NOT_FOUND(HttpStatus.NOT_FOUND),
    ISSUE_NOT_FOUND(HttpStatus.NOT_FOUND),
    EVENT_NOT_FOUND(HttpStatus.NOT_FOUND),
    ARTICLE_NOT_FOUND(HttpStatus.NOT_FOUND),
    MINDMAP_NOT_FOUND(HttpStatus.NOT_FOUND),
    LOGIN_ID_TAKEN(HttpStatus.CONFLICT),
    LOGIN_FAILED(HttpStatus.UNAUTHORIZED),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED),
    FORBIDDEN(HttpStatus.FORBIDDEN),
    DICTIONARY_UNAVAILABLE(HttpStatus.BAD_GATEWAY),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR),

    // 스프링이 내는 오류 — 상태 이름을 그대로 code 로 쓴다 (2026-10-22)
    NOT_FOUND(HttpStatus.NOT_FOUND),
    METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED),
    NOT_ACCEPTABLE(HttpStatus.NOT_ACCEPTABLE),
    UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE),

    // 내부 API 전용 (B1 · W1)
    RESULT_SCHEMA_INVALID(HttpStatus.BAD_REQUEST),
    ANALYSIS_JOB_NOT_FOUND(HttpStatus.NOT_FOUND),
    JOB_STATE_CONFLICT(HttpStatus.CONFLICT),
    ALREADY_RELEASED(HttpStatus.CONFLICT);

    private final HttpStatus status;

    ErrorCode(HttpStatus status) {
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }

    // 우리 코드를 고르지 않고 스프링이 상태만 정한 오류에 붙일 code. 표에 없는 4xx 는 「요청을 고쳐 보내라」는 뜻이라 VALIDATION_FAILED
    public static ErrorCode forStatus(HttpStatusCode status) {
        return switch (status.value()) {
            case 401 -> UNAUTHORIZED;
            case 403 -> FORBIDDEN;
            case 404 -> NOT_FOUND;
            case 405 -> METHOD_NOT_ALLOWED;
            case 406 -> NOT_ACCEPTABLE;
            case 415 -> UNSUPPORTED_MEDIA_TYPE;
            default -> status.is5xxServerError() ? INTERNAL_ERROR : VALIDATION_FAILED;
        };
    }
}
