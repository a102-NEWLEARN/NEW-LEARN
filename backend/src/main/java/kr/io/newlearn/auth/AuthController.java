package kr.io.newlearn.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import kr.io.newlearn.auth.dto.LoginRequest;
import kr.io.newlearn.common.security.MemberPrincipal;
import kr.io.newlearn.member.dto.MemberResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AuthController {
    private final AuthService service;
    private final LoginSessions loginSessions;

    public AuthController(AuthService service, LoginSessions loginSessions) {
        this.service = service;
        this.loginSessions = loginSessions;
    }

    // A15 로그인 — 맞으면 회원 정보와 새 세션
    @PostMapping("/api/v1/auth/login")
    public MemberResponse login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        MemberResponse member = service.login(request);
        loginSessions.open(
                new MemberPrincipal(member.id(), member.loginId(), member.name()), httpRequest, httpResponse);
        return member;
    }

    // A16 로그아웃 — 로그인이 필요하다(SecurityConfig). 세션이 없으면 여기 오기 전에 401
    @PostMapping("/api/v1/auth/logout")
    public ResponseEntity<Void> logout(HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        loginSessions.close(httpRequest, httpResponse);
        return ResponseEntity.noContent().build();
    }
}
