package kr.io.newlearn.common.error;

import java.util.List;
import org.springframework.http.ProblemDetail;

// 오류 응답(RFC 9457 ProblemDetail + code)을 만드는 곳 하나. 컨트롤러 오류(GlobalExceptionHandler)와
// 로그인 · 권한 오류(Security)가 같이 써서 모든 오류에 code 가 붙는다 (docs/api.md 1절 「오류」)
public final class ProblemDetails {

    private ProblemDetails() {}

    public static ProblemDetail of(ErrorCode errorCode, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(errorCode.status(), detail);
        problem.setProperty("code", errorCode.name());
        return problem;
    }

    // 짚을 칸이 없으면 errors 를 싣지 않는다
    public static void addErrors(ProblemDetail problem, List<FieldErrorItem> errors) {
        if (!errors.isEmpty()) {
            problem.setProperty("errors", errors);
        }
    }

    static boolean hasCode(ProblemDetail problem) {
        return problem.getProperties() != null && problem.getProperties().containsKey("code");
    }
}
