package kr.io.newlearn.common.web;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.context.annotation.Configuration;

// Swagger 화면(/swagger-ui.html) · OpenAPI 문서(/v3/api-docs)의 이름 · 태그 · 뜻풀이 (Jira 107 · 112)
// 계약의 원본은 docs/api.md 다 — 이 문서는 컨트롤러 코드에서 만든 사본이라 둘이 다르면 docs/api.md 를 따른다
// 태그는 화면 순서(카테고리 → 이슈 → 기사)로 둔다. 컨트롤러는 아래 상수로 태그를 단다
// 명세대로 만들고 시험을 마친 작업만 summary 앞에 [확정] 을 붙인다. 아직 없는 API 는 넣지 않는다
// 오류 응답(@ApiResponse)을 적는 작업은 200 도 함께 적는다 — 응답을 하나라도 적으면 springdoc 이
// 성공 응답을 따로 만들지 않는다. 200 의 모양은 적지 않아도 반환 타입에서 채운다
@Configuration
@OpenAPIDefinition(
        info = @Info(title = "NEW:LEARN API", version = "v1", description = OpenApiConfig.DESCRIPTION),
        tags = {
            @Tag(name = OpenApiConfig.TAG_CATEGORY, description = "카테고리 5개 — 카테고리 선택 · 사이드바 (F02)"),
            @Tag(name = OpenApiConfig.TAG_ISSUE, description = "이슈 목록 · 헤더 · 타임라인 (F02 · F07)"),
            @Tag(name = OpenApiConfig.TAG_ARTICLE, description = "최신 기사 · 기사 상세와 소속 사건 · 이슈 (F01 · F11)"),
            @Tag(
                    name = OpenApiConfig.TAG_MEMBER,
                    description = "가입 · 로그인 · 로그아웃 (F12). 세션 쿠키 + CSRF 번호표 — POST 는 XSRF-TOKEN 쿠키 값을 X-XSRF-TOKEN 헤더로")
        })
public class OpenApiConfig {
    public static final String TAG_CATEGORY = "카테고리";
    public static final String TAG_ISSUE = "이슈";
    public static final String TAG_ARTICLE = "기사";
    public static final String TAG_MEMBER = "회원";

    // 오류 응답 본문 — RFC 9457 Problem Details 에 code 를 더한 모양 (docs/api.md 1절 「오류」)
    public static final String PROBLEM_JSON = "application/problem+json";

    static final String DESCRIPTION = """
            계약의 원본은 저장소의 `docs/api.md` 입니다. 이 화면은 코드에서 만든 사본입니다.

            **[확정]** — `docs/api.md` 명세대로 만들고 시험을 마친 API 입니다. 화면이 그대로 써도 됩니다.
            표시가 없는 API 는 만드는 중이라 바뀔 수 있습니다. 아직 만들지 않은 API 는 여기에 없습니다(명세는 `docs/api-screen.md`).

            오류는 모두 Problem Details(`application/problem+json`)에 `code` 를 더한 모양입니다. 코드 목록은 `docs/api.md` 2절입니다.
            """;
}
