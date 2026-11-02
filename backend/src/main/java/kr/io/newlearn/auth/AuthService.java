package kr.io.newlearn.auth;

import java.util.Optional;
import java.util.UUID;
import kr.io.newlearn.auth.dto.LoginRequest;
import kr.io.newlearn.common.error.ApiException;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.web.QueryText;
import kr.io.newlearn.member.Member;
import kr.io.newlearn.member.MemberRepository;
import kr.io.newlearn.member.MemberService;
import kr.io.newlearn.member.PasswordRule;
import kr.io.newlearn.member.dto.MemberResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// A15 로그인 — 아이디 · 비밀번호를 맞춰 보고 회원 정보를 준다. 세션을 여는 일은 컨트롤러가 LoginSessions 로 한다 (Jira 62)
// 회원 행과 관심 분야를 읽기 트랜잭션 하나에서 읽는다(docs/backend-convention.md 6절)
@Service
@Transactional(readOnly = true)
public class AuthService {

    // 어느 쪽이 틀렸는지 알려 주지 않는다 — 없는 아이디와 틀린 비밀번호가 같은 응답이다 (docs/api-screen.md A15)
    static final String LOGIN_FAILED_DETAIL = "아이디 또는 비밀번호가 맞지 않는다";

    private final MemberRepository members;
    private final MemberService memberService;
    private final PasswordEncoder passwordEncoder;
    private final LoginAttemptGuard guard;
    // 없는 아이디일 때도 해시 비교를 한 번 해서 걸리는 시간으로 아이디가 있는지 알 수 없게 한다
    private final String dummyHash;

    public AuthService(
            MemberRepository members,
            MemberService memberService,
            PasswordEncoder passwordEncoder,
            LoginAttemptGuard guard) {
        this.members = members;
        this.memberService = memberService;
        this.passwordEncoder = passwordEncoder;
        this.guard = guard;
        this.dummyHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    public MemberResponse login(LoginRequest request) {
        String loginId = request.loginId();
        long attempt = guard.reserveAttempt(loginId);
        if (attempt == 0) {
            throw new ApiException(ErrorCode.TOO_MANY_REQUESTS, "로그인을 5번 틀려 1분 동안 잠겼다");
        }
        // U+0000 이 든 아이디는 가입 규칙([a-z0-9_])상 있을 수 없다 — DB 에 묻지 않고 없는 아이디로 센다
        // (PostgreSQL 이 이 글자를 받지 못해 500 이었다, Jira 43 후속)
        Optional<Member> member = QueryText.containsNul(loginId) ? Optional.empty() : members.findByLoginId(loginId);
        if (!passwordMatches(request.password(), member)) {
            guard.recordFailure(loginId, attempt);
            throw new ApiException(ErrorCode.LOGIN_FAILED, LOGIN_FAILED_DETAIL);
        }
        guard.recordSuccess(loginId);
        return memberService.profile(member.get().getId());
    }

    private boolean passwordMatches(String password, Optional<Member> member) {
        // bcrypt 가 읽지 못하는 길이는 비교하지 않고 틀린 것으로 본다(가입에서 막아 맞는 회원이 있을 수 없다)
        if (PasswordRule.tooLongForHash(password)) {
            return false;
        }
        if (member.isEmpty()) {
            passwordEncoder.matches(password, dummyHash);
            return false;
        }
        return passwordEncoder.matches(password, member.get().getPasswordHash());
    }
}
