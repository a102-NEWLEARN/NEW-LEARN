package kr.io.newlearn;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;

// Spring Security 의 기본 계정(InMemoryUserDetailsManager)을 만들지 않는다 — 로그인은 AuthService 와 세션이 하고(Jira 62),
// 그대로 두면 뜰 때마다 기본 계정 비밀번호를 로그에 찍어 컨테이너 로그(kubectl logs)에 비밀값이 남는다.
// Loki 로는 Alloy 가 10-28 부터 그 줄을 버린다(SSOT 6절 「로그」) (Jira 144)
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class BackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(BackendApplication.class, args);
    }
}
