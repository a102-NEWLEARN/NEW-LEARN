package kr.io.newlearn.common.web;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;
import org.springframework.context.annotation.Configuration;

// Swagger 화면(/swagger-ui.html) · OpenAPI 문서(/v3/api-docs)의 이름 (Jira 107)
// 계약의 원본은 docs/api.md 다 — 이 문서는 컨트롤러 코드에서 만든 사본이라 둘이 다르면 docs/api.md 를 따른다
@Configuration
@OpenAPIDefinition(
        info =
                @Info(
                        title = "NEW:LEARN API",
                        version = "v1",
                        description = "계약의 원본은 저장소의 docs/api.md 입니다. 이 화면은 코드에서 만든 사본입니다."))
public class OpenApiConfig {}
