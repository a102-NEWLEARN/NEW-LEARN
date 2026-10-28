package kr.io.newlearn.common.web;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.examples.Example;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.parameters.Parameter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import kr.io.newlearn.common.error.ErrorCode;
import org.jspecify.annotations.Nullable;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

// Swagger 의 오류 응답마다 그 상태 · code 로 예시를 단다 — 문서에만 쓴다. 실제 본문은 common.error.ProblemDetails 가 만든다
// Problem 스키마 칸에 예시를 박으면 401 · 404 아래에도 같은 400 예시가 보인다
// code 는 응답 설명 앞의 오류 코드(「ARTICLE_NOT_FOUND — …」)에서 읽는다. 둘이면 예시도 둘이다(A9 의 404)
@Component
class ProblemExampleCustomizer implements OpenApiCustomizer {
    private static final Pattern CODE = Pattern.compile("[A-Z][A-Z_]*[A-Z]");

    @Override
    public void customise(OpenAPI openApi) {
        openApi.getPaths().forEach((path, item) -> {
            for (Operation operation : item.readOperations()) {
                String instance = instance(path, operation);
                operation.getResponses().forEach((code, response) -> {
                    // 응답 코드 칸에는 "default" 도 올 수 있다
                    HttpStatus status = code.matches("\\d{3}") ? HttpStatus.resolve(Integer.parseInt(code)) : null;
                    var content = response.getContent();
                    MediaType media = content == null ? null : content.get(OpenApiConfig.PROBLEM_JSON);
                    if (status != null && media != null) {
                        addExamples(media, status, errorCodes(response.getDescription(), status), instance);
                    }
                });
            }
        });
    }

    private static void addExamples(MediaType media, HttpStatus status, List<ErrorCode> codes, String instance) {
        if (codes.size() == 1) {
            media.setExample(example(status, codes.getFirst(), instance));
            return;
        }
        Map<String, Example> examples = new LinkedHashMap<>();
        for (ErrorCode code : codes) {
            examples.put(code.name(), new Example().summary(code.name()).value(example(status, code, instance)));
        }
        media.setExamples(examples);
    }

    private static Map<String, Object> example(HttpStatus status, ErrorCode code, String instance) {
        Map<String, Object> example = new LinkedHashMap<>();
        example.put("title", status.getReasonPhrase());
        example.put("status", status.value());
        example.put("instance", instance);
        example.put("code", code.name());
        return example;
    }

    // 설명에 적힌 오류 코드 중 이 상태의 것. 하나도 없으면 상태로 정해지는 code (스프링이 낸 오류와 같다)
    private static List<ErrorCode> errorCodes(@Nullable String description, HttpStatus status) {
        List<ErrorCode> codes = new ArrayList<>();
        var matcher = CODE.matcher(description == null ? "" : description);
        while (matcher.find()) {
            String name = matcher.group();
            Arrays.stream(ErrorCode.values())
                    .filter(code -> code.name().equals(name) && code.status() == status && !codes.contains(code))
                    .forEach(codes::add);
        }
        return codes.isEmpty() ? List.of(ErrorCode.forStatus(status)) : codes;
    }

    // 요청 주소 — 주소의 {이름} 은 그 인자의 예시로 채운다
    private static String instance(String path, Operation operation) {
        String instance = path;
        List<Parameter> parameters = operation.getParameters() == null ? List.of() : operation.getParameters();
        for (Parameter parameter : parameters) {
            if ("path".equals(parameter.getIn()) && parameter.getExample() != null) {
                instance = instance.replace("{" + parameter.getName() + "}", String.valueOf(parameter.getExample()));
            }
        }
        return instance;
    }
}
