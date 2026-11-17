package kr.io.newlearn.common.error;

import java.io.Serial;
import java.util.List;
import org.jspecify.annotations.Nullable;

// 서비스가 「이 요청은 이 code 로 실패」라고 알릴 때 던진다. GlobalExceptionHandler 가 오류 응답으로 바꾼다
// detail 은 개발자용 설명이라 화면에 그대로 보이지 않는다 (docs/api.md 2절)
public class ApiException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    private final ErrorCode errorCode;
    // 예외를 직렬화해 보낼 일이 없어 칸별 이유는 직렬화에서 뺀다
    private final transient List<FieldErrorItem> errors;

    public ApiException(ErrorCode errorCode, @Nullable String detail) {
        this(errorCode, detail, List.of());
    }

    // 요청 값이 서비스 규칙에 안 맞을 때(예: 없는 관심 분야 코드) — VALIDATION_FAILED 와 칸별 이유를 같이 준다
    public ApiException(ErrorCode errorCode, @Nullable String detail, List<FieldErrorItem> errors) {
        super(detail);
        this.errorCode = errorCode;
        this.errors = List.copyOf(errors);
    }

    public ErrorCode errorCode() {
        return errorCode;
    }

    public List<FieldErrorItem> errors() {
        return errors;
    }
}
