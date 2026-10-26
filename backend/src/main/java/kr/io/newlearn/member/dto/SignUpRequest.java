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

        // 64자 상한: bcrypt 는 72바이트까지만 읽는다. 바이트 수는 서비스가 한 번 더 본다
        @NotNull(message = "비밀번호를 입력해 주세요") @Size(min = 8, max = 64, message = "비밀번호는 8~64자여야 해요")
        String password,

        @NotBlank(message = "이름을 입력해 주세요") String name,

        @NotEmpty(message = "관심 분야를 1개 이상 골라 주세요") List<@NotBlank(message = "관심 분야 코드가 비었어요") String> categoryCodes) {}
