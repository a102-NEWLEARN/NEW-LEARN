package kr.io.newlearn.common.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.ProblemDetails;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import tools.jackson.databind.json.JsonMapper;

// 로그인 · 권한 오류(401 · 403)를 컨트롤러 오류와 같은 모양(ProblemDetail + code)으로 쓴다 (docs/api.md 1절 「오류」)
// 이 오류들은 컨트롤러에 닿기 전 Security 필터에서 나서 GlobalExceptionHandler 를 거치지 않는다. 그래서 여기서 직접 쓴다
public class SecurityErrorHandler implements AuthenticationEntryPoint, AccessDeniedHandler {

    private final JsonMapper jsonMapper;

    public SecurityErrorHandler(JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
    }

    // 로그인하지 않았다 → 401
    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException ex)
            throws IOException {
        write(request, response, ErrorCode.UNAUTHORIZED, "로그인이 필요한 주소다");
    }

    // 로그인은 했지만 허락되지 않았거나, POST · PUT · DELETE 에 CSRF 번호표가 없거나 틀렸다 → 403
    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException ex)
            throws IOException {
        write(request, response, ErrorCode.FORBIDDEN, "허락되지 않은 요청이다 (권한 또는 CSRF 번호표)");
    }

    private void write(HttpServletRequest request, HttpServletResponse response, ErrorCode errorCode, String detail)
            throws IOException {
        ProblemDetail problem = ProblemDetails.of(errorCode, detail);
        problem.setInstance(URI.create(request.getRequestURI()));
        response.setStatus(errorCode.status().value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        // Spring Boot 가 만든 JsonMapper 라야 code 가 properties 안이 아니라 맨 위 칸으로 나간다
        jsonMapper.writeValue(response.getOutputStream(), problem);
    }
}
