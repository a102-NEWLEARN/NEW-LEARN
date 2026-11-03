package kr.io.newlearn.common.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.savedrequest.NullRequestCache;
import tools.jackson.databind.json.JsonMapper;

// 직원용 문(/internal/**) — AI 워커(W1)와 수집 배치(B2 적재 · B1 투입)만 부른다 (Jira 30 · 153, docs/api.md 1절 「인증」)
// 손님용 문(SecurityConfig)과 체인을 나눠 세션 · CSRF 번호표를 쓰지 않는다. 워커 · 배치는 쿠키 없이 부른다
// 출입증 두 장 — 워커 키는 W1, 배치 키는 B2 · B1 만 연다. 키가 없거나 틀리면 401, 남의 문 키면 403 (2026-10-26 결정)
// 인증 · 권한 코드라 바꾸면 사람이 최종 확인한다 (AGENTS.md)
@Configuration
public class InternalApiSecurityConfig {

    // 손님용 체인보다 먼저 본다. 이 체인은 /internal/** 만 맡고, 나머지 주소는 손님용 체인으로 간다
    @Bean
    @Order(1)
    SecurityFilterChain internalApiSecurityFilterChain(
            HttpSecurity http,
            JsonMapper jsonMapper,
            @Value("${newlearn.internal.worker-key:}") String workerKey,
            @Value("${newlearn.internal.batch-key:}") String batchKey)
            throws Exception {
        SecurityErrorHandler errors = SecurityErrorHandler.forInternalApi(jsonMapper);
        http.securityMatcher("/internal/**")
                .authorizeHttpRequests(auth -> auth
                        // W1 결과 받기
                        .requestMatchers("/internal/v1/analysis-jobs/**")
                        .hasRole("WORKER")
                        // B2 기사 적재(/internal/v1/articles — /** 앞 주소 자체도 덮는다) · B1 기사 투입
                        .requestMatchers("/internal/v1/articles/**")
                        .hasRole("BATCH")
                        // 정하지 않은 직원용 주소는 어느 키로도 못 연다
                        .anyRequest()
                        .denyAll())
                .addFilterBefore(new InternalKeyFilter(workerKey, batchKey), AnonymousAuthenticationFilter.class)
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(cache -> cache.requestCache(new NullRequestCache()))
                .logout(AbstractHttpConfigurer::disable)
                .exceptionHandling(
                        handling -> handling.authenticationEntryPoint(errors).accessDeniedHandler(errors));
        return http.build();
    }
}
