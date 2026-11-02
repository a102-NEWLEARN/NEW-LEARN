package kr.io.newlearn.member;

import java.nio.charset.StandardCharsets;

// 비밀번호 바이트 규칙 — 가입(A14)은 거절하고, 로그인(A15)은 비교하지 않고 틀린 것으로 본다 (Jira 144)
// bcrypt 는 72바이트까지만 읽는다. 한글 비밀번호는 글자 수보다 바이트 수가 먼저 찬다
public final class PasswordRule {

    static final int MAX_BYTES = 72;

    private PasswordRule() {}

    public static boolean tooLongForHash(String password) {
        return password.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES;
    }
}
