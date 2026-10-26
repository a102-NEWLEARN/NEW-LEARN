package kr.io.newlearn.common.web;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

// 목록 요청의 page · size (docs/api.md 1절 「목록 요청」). 컨트롤러에서 @Valid PageQuery query 로 받는다
// 빈 값은 기본값(page 0 · size 20)으로 채우고, 범위를 벗어나면 잘라 주지 않고 400 으로 알린다
// Spring 의 Pageable 인자를 바로 받지 않는 까닭: 범위 밖 값을 조용히 고쳐서 받는다
// Swagger 에는 컨트롤러가 @ParameterObject 로 page · size 두 인자로 펼쳐 보인다
// schema 를 직접 주면 springdoc 이 Integer 를 읽지 않고 문자열로 두어서 type 을 적는다
public record PageQuery(
        @Parameter(description = "쪽 번호(0부터)", schema = @Schema(type = "integer", format = "int32", defaultValue = "0"))
        @Min(value = 0, message = "page 는 0 이상이어야 해요")
        Integer page,

        @Parameter(
                description = "한 쪽의 항목 수(1~100)",
                schema = @Schema(type = "integer", format = "int32", defaultValue = "20"))
        @Min(value = 1, message = "size 는 1에서 100 사이여야 해요")
        @Max(value = 100, message = "size 는 1에서 100 사이여야 해요")
        Integer size) {

    public static final int DEFAULT_SIZE = 20;

    public PageQuery {
        page = page == null ? 0 : page;
        size = size == null ? DEFAULT_SIZE : size;
    }

    // 정렬은 엔드포인트마다 정해 두므로 부르는 쪽이 넘긴다
    public Pageable toPageable(Sort sort) {
        return PageRequest.of(page, size, sort);
    }
}
