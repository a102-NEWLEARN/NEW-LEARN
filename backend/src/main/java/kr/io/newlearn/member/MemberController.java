package kr.io.newlearn.member;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.net.URI;
import kr.io.newlearn.auth.LoginSessions;
import kr.io.newlearn.common.security.MemberPrincipal;
import kr.io.newlearn.member.dto.MemberResponse;
import kr.io.newlearn.member.dto.SignUpRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MemberController {
    private final MemberService service;
    private final LoginSessions loginSessions;

    public MemberController(MemberService service, LoginSessions loginSessions) {
        this.service = service;
        this.loginSessions = loginSessions;
    }

    // A14 가입 — 만든 뒤 바로 로그인된 세션을 연다(가입 화면이 가입 뒤 바로 들어간다, docs/api-screen.md A14)
    @PostMapping("/api/v1/members")
    public ResponseEntity<MemberResponse> signUp(
            @Valid @RequestBody SignUpRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        MemberResponse member = service.signUp(request);
        loginSessions.open(
                new MemberPrincipal(member.id(), member.loginId(), member.name()), httpRequest, httpResponse);
        return ResponseEntity.created(URI.create("/api/v1/members/me")).body(member);
    }
}
