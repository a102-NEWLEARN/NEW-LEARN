package kr.io.newlearn.common.security;

import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

// POST · PUT · DELETE 시험에 CSRF 번호표를 붙인다 — 화면(axios)처럼 XSRF-TOKEN 쿠키와 같은 값의 X-XSRF-TOKEN 헤더 (Jira 62)
// spring-security-test 의 .with(csrf()) 는 쓰지 않는다. 같은 시험 컨텍스트가 함께 쓰는 CsrfFilter 의 저장소를
// 세션 저장소로 바꿔 끼워서, 그 뒤 시험의 요청마다 세션이 생기고 번호표 쿠키가 사라진다(2026-10-26 확인)
public final class TestCsrf {
    private TestCsrf() {}

    public static RequestPostProcessor csrfToken() {
        return request -> {
            String token = UUID.randomUUID().toString();
            List<Cookie> cookies =
                    new ArrayList<>(request.getCookies() == null ? List.of() : Arrays.asList(request.getCookies()));
            cookies.add(new Cookie("XSRF-TOKEN", token));
            request.setCookies(cookies.toArray(Cookie[]::new));
            request.addHeader("X-XSRF-TOKEN", token);
            return request;
        };
    }
}
