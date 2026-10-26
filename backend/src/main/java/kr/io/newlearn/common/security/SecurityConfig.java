package kr.io.newlearn.common.security;

import jakarta.servlet.DispatcherType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.savedrequest.NullRequestCache;
import tools.jackson.databind.json.JsonMapper;

// 누가 어떤 주소를 부를 수 있나 (docs/api.md 1절 「인증」). 인증 · 권한 코드라 바꾸면 사람이 최종 확인한다 (AGENTS.md)
// CSRF 는 번호표 쿠키(csrf.spa()) — 서버가 XSRF-TOKEN 쿠키를 주고 화면이 X-XSRF-TOKEN 헤더로 돌려보낸다(axios 기본 이름)
// 로그인 세션은 Spring Session 이 Redis 에 둔다(application.yaml 의 server.servlet.session) (Jira 62)
@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain apiSecurityFilterChain(
            HttpSecurity http,
            JsonMapper jsonMapper,
            @Value("${server.servlet.session.cookie.secure:false}") boolean secureCookie)
            throws Exception {
        SecurityErrorHandler errors = new SecurityErrorHandler(jsonMapper);
        // 화면이 읽어야 해서 HttpOnly 가 아니다. Secure 는 세션 쿠키와 같은 설정을 따른다
        CookieCsrfTokenRepository csrfTokens = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrfTokens.setCookieCustomizer(cookie -> cookie.secure(secureCookie).sameSite("Lax"));
        http.authorizeHttpRequests(auth -> auth
                        // 오류 응답을 만드는 내부 전달(ERROR dispatch)은 막지 않는다
                        .dispatcherTypeMatchers(DispatcherType.ERROR)
                        .permitAll()
                        // 헬스 — compose · 쿠버네티스가 로그인 없이 본다. 우리 체인을 만들면 스프링이 열어 두던 것이 사라진다
                        .requestMatchers(HttpMethod.GET, "/actuator/health", "/actuator/health/**")
                        .permitAll()
                        // 둘러보기(A1 ~ A9 · A13) · 용어사전(A19)
                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/v1/categories/**",
                                "/api/v1/issues/**",
                                "/api/v1/events/**",
                                "/api/v1/articles/**",
                                "/api/v1/search/**",
                                "/api/v1/dictionary")
                        .permitAll()
                        // Swagger(springdoc) — 개발하는 동안 FE 가 로그인 없이 본다 (SSOT.md 6절 「공개 화면」, Jira 107)
                        // 다시 잠글지는 SSOT.md 8절. 잠글 때는 이 줄과 인프라 길(infra/k8s/services/app/routes.yaml)을 같이 뺀다
                        .requestMatchers(
                                HttpMethod.GET, "/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs", "/v3/api-docs/**")
                        .permitAll()
                        // 가입(A14) · 로그인(A15)
                        .requestMatchers(HttpMethod.POST, "/api/v1/members", "/api/v1/auth/login")
                        .permitAll()
                        // 나머지 — 로그아웃 · 내 정보 · 관심 분야(A16 ~ A18), 내부 API(/internal/v1)
                        .anyRequest()
                        .authenticated())
                // 스프링 기본 /logout 을 끈다. 로그인 · 로그아웃은 Jira 62 의 API(A15 · A16)다
                // HTTP Basic · 로그인 폼은 직접 만든 체인에서 처음부터 꺼져 있다 (SecurityRulesTest 가 필터 목록으로 확인)
                .logout(AbstractHttpConfigurer::disable)
                // spa(): 번호표 쿠키 저장소 + 헤더로 온 값을 그대로 맞춰 보는 처리기. 저장소만 Secure 를 맞춘 것으로 바꾼다
                // 처리기가 요청마다 번호표를 꺼내 두므로 쿠키가 없는 첫 요청의 응답에 XSRF-TOKEN 이 붙는다(Security 7.1,
                // SecurityRulesTest 가 확인) — 화면은 첫 POST 전에 아무 GET 응답에서 번호표를 받는다
                .csrf(csrf -> csrf.spa().csrfTokenRepository(csrfTokens))
                // 401 을 줄 때 「로그인 뒤 돌아갈 요청」을 세션에 저장하지 않는다 — 저장하면 손님이 부를 때마다 세션이 생긴다
                .requestCache(cache -> cache.requestCache(new NullRequestCache()))
                .exceptionHandling(
                        handling -> handling.authenticationEntryPoint(errors).accessDeniedHandler(errors));
        return http.build();
    }

    // 비밀번호 해시 — 지금 기본은 bcrypt. 저장값 앞에 {bcrypt} 가 붙어 나중에 다른 방식으로 바꿔도 옛 값을 읽는다 (Jira 62)
    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }
}
