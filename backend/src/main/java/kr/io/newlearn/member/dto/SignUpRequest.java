package kr.io.newlearn.member.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

// A14 가입 요청 (docs/api-screen.md A14). message 는 errors[].reason 으로 화면에 그대로 보인다
// 아이디 규칙은 2026-10-26 사용자 결정 — 영문 소문자 · 숫자 · _, 4 ~ 20자
public record SignUpRequest(
        @NotNull(message = "아이디를 입력해 주세요")
        @Pattern(regexp = "[a-z0-9_]{4,20}", message = "아이디는 영문 소문자 · 숫자 · _ 로 4~20자여야 해요")
        String loginId,

        // 64자 상한: bcrypt 는 72바이트까지만 읽는다. 바이트 수는 PasswordRule 이 한 번 더 본다
        // 공백만으로 된 값은 막는다 — 로그인(LoginRequest)이 「비었음」으로 거절해 다시 들어올 길이 없어진다
        @NotBlank(message = "비밀번호를 입력해 주세요") @Size(min = 8, max = 64, message = "비밀번호는 8~64자여야 해요")
        String password,

        // 20자 상한: 이름은 세션(MemberPrincipal)에도 실려 하루 동안 Redis 에 남는다
        // U+0000 은 PostgreSQL 이 받지 못한다 — 막지 않으면 저장 오류가 아이디 중복(409)으로 잘못 읽혔다 (Jira 43 후속)
        @NotBlank(message = "이름을 입력해 주세요")
        @Size(max = 20, message = "이름은 20자까지예요")
        @Pattern(regexp = "[^\\x00]*", message = "이름에 쓸 수 없는 글자가 들어 있어요")
        String name,

        @NotEmpty(message = "관심 분야를 1개 이상 골라 주세요") List<@NotBlank(message = "관심 분야 코드가 비었어요") String> categoryCodes) {

    // 비밀번호가 로그에 찍히지 않게 — 스프링은 DEBUG 로그에 읽은 요청 본문을 toString 으로 찍는다
    @Override
    public String toString() {
        return "SignUpRequest[loginId=" + loginId + ", password=(가림), name=" + name + ", categoryCodes=" + categoryCodes
                + "]";
    }
}
