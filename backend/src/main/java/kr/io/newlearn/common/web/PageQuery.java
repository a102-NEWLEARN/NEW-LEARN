package kr.io.newlearn.common.web;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

// 목록 요청의 page · size (docs/api.md 1절 「목록 요청」). 컨트롤러에서 @Valid PageQuery query 로 받는다
// 빈 값은 기본값(page 0 · size 20)으로 채우고, 범위를 벗어나면 잘라 주지 않고 400 으로 알린다
// Spring 의 Pageable 인자를 바로 받지 않는 까닭: 범위 밖 값을 조용히 고쳐서 받는다
public record PageQuery(
        @Min(value = 0, message = "page 는 0 이상이어야 해요") Integer page,

        @Min(value = 1, message = "size 는 1에서 100 사이여야 해요") @Max(value = 100, message = "size 는 1에서 100 사이여야 해요")
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
