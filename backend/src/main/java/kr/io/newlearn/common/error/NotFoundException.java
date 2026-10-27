package kr.io.newlearn.common.error;

import java.io.Serial;
import org.springframework.http.HttpStatus;

// 찾는 단건이 없을 때 (docs/api.md 1절 「빈 결과」). 404 코드만 받는다
// 예: throw new NotFoundException(ErrorCode.ISSUE_NOT_FOUND, "이슈를 찾을 수 없다: " + issueId);
public class NotFoundException extends ApiException {

    @Serial
    private static final long serialVersionUID = 1L;

    public NotFoundException(ErrorCode errorCode, String detail) {
        super(requireNotFound(errorCode), detail);
    }

    private static ErrorCode requireNotFound(ErrorCode errorCode) {
        if (errorCode.status() != HttpStatus.NOT_FOUND) {
            throw new IllegalArgumentException("404 코드가 아니다: " + errorCode);
        }
        return errorCode;
    }
}
