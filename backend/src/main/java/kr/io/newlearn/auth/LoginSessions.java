package kr.io.newlearn.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.util.List;
import kr.io.newlearn.common.security.MemberPrincipal;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.stereotype.Component;

// 로그인 세션을 열고 닫는 곳 하나 — 가입(A14) · 로그인(A15) · 로그아웃(A16)이 같이 쓴다 (Jira 62)
// 세션 자체는 Spring Session 이 Redis 에 둔다. 여기서는 「누가 로그인했나」(SecurityContext)를 세션에 넣고 뺀다
@Component
public class LoginSessions {

    // 다음 요청에서 보안 필터가 읽는 자리와 같은 세션 칸(SPRING_SECURITY_CONTEXT)에 저장한다
    private final SecurityContextRepository contexts = new HttpSessionSecurityContextRepository();
    private final CookieCsrfTokenRepository csrfTokens;

    public LoginSessions(CookieCsrfTokenRepository csrfTokens) {
        this.csrfTokens = csrfTokens;
    }

    public void open(MemberPrincipal member, HttpServletRequest request, HttpServletResponse response) {
        // 세션 고정 막기 — 로그인 전에 쓰던 세션 ID 를 그대로 이어 쓰지 않는다 (docs/api-screen.md A15)
        if (request.getSession(false) != null) {
            request.changeSessionId();
        } else {
            request.getSession(true);
        }
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(member, null, List.of()));
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
        renewCsrfToken(request, response);
    }

    public void close(HttpServletRequest request, HttpServletResponse response) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        SecurityContextHolder.clearContext();
        renewCsrfToken(request, response);
    }

    // 로그인 상태가 바뀌면 번호표도 새로 — 응답에 새 XSRF-TOKEN 쿠키를 실어 화면이 다음 POST 에 바로 쓴다
    private void renewCsrfToken(HttpServletRequest request, HttpServletResponse response) {
        csrfTokens.saveToken(csrfTokens.generateToken(request), request, response);
    }
}
