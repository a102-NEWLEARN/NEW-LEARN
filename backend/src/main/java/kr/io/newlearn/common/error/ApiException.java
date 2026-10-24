package kr.io.newlearn.common.error;

// 서비스가 「이 요청은 이 code 로 실패」라고 알릴 때 던진다. GlobalExceptionHandler 가 오류 응답으로 바꾼다
// detail 은 개발자용 설명이라 화면에 그대로 보이지 않는다 (docs/api.md 2절)
public class ApiException extends RuntimeException {

    private final ErrorCode errorCode;

    public ApiException(ErrorCode errorCode, String detail) {
        super(detail);
        this.errorCode = errorCode;
    }

    public ErrorCode errorCode() {
        return errorCode;
    }
}
