package kr.io.newlearn.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// A15 로그인 요청 (docs/api-screen.md A15). 길이 상한은 잠금 횟수를 세는 Redis 키가 터무니없이 길어지지 않게
public record LoginRequest(
        @NotBlank(message = "아이디를 입력해 주세요") @Size(max = 64, message = "아이디가 너무 길어요")
        String loginId,

        @NotBlank(message = "비밀번호를 입력해 주세요") @Size(max = 128, message = "비밀번호가 너무 길어요")
        String password) {

    // 비밀번호가 로그에 찍히지 않게 — 스프링은 DEBUG 로그에 읽은 요청 본문을 toString 으로 찍는다
    @Override
    public String toString() {
        return "LoginRequest[loginId=" + loginId + ", password=(가림)]";
    }
}
