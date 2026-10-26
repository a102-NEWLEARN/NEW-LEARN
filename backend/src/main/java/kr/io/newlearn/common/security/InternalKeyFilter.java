package kr.io.newlearn.common.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.web.filter.OncePerRequestFilter;

// 직원용 문(/internal/**)의 출입증 검사 (Jira 30, docs/api.md 1절 「인증」)
// X-Internal-Key 헤더를 워커 키 · 배치 키와 견줘 맞으면 역할 WORKER · BATCH 로 인증한다. 맞지 않으면 손님으로 두어 401 이 난다
// 키를 설정하지 않으면(빈 값) 어떤 헤더와도 맞지 않는다 — 출입증을 봉인하기 전에는 모두 닫힌 채로 시작한다
// 키 · 헤더 값은 로그에 남기지 않는다
final class InternalKeyFilter extends OncePerRequestFilter {

    static final String HEADER = "X-Internal-Key";

    private final SecurityContextHolderStrategy contexts = SecurityContextHolder.getContextHolderStrategy();
    private final List<Pass> passes = new ArrayList<>();

    InternalKeyFilter(String workerKey, String batchKey) {
        addPass("WORKER", workerKey);
        addPass("BATCH", batchKey);
    }

    private void addPass(String role, String key) {
        if (key != null && !key.isBlank()) {
            passes.add(new Pass(role, sha256(key)));
        }
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String presented = request.getHeader(HEADER);
        String role = presented == null ? null : roleOf(presented);
        if (role != null) {
            SecurityContext context = contexts.createEmptyContext();
            context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                    role.toLowerCase(Locale.ROOT), null, AuthorityUtils.createAuthorityList("ROLE_" + role)));
            contexts.setContext(context);
        }
        chain.doFilter(request, response);
    }

    // 걸린 시간으로 키를 한 글자씩 맞혀 보지 못하게, 길이가 같은 해시끼리 MessageDigest.isEqual 로 견준다
    // 앞에서 맞아도 멈추지 않고 키를 모두 견준다
    private String roleOf(String presented) {
        byte[] digest = sha256(presented);
        String role = null;
        for (Pass pass : passes) {
            if (MessageDigest.isEqual(digest, pass.digest()) && role == null) {
                role = pass.role();
            }
        }
        return role;
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 이 없는 JVM 이다", e);
        }
    }

    private record Pass(String role, byte[] digest) {}
}
