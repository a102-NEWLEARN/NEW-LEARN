package kr.io.newlearn.common.web;

import java.util.List;
import org.springframework.data.domain.Page;

// 목록 응답 모양 (docs/api.md 1절 「목록 응답」). Spring Data 의 Page 를 그대로 내보내지 않고 이 모양으로 옮긴다
// 예: PageResponse.from(articlePage.map(ArticleSummary::from))
public record PageResponse<T>(List<T> items, int page, int size, long totalElements, int totalPages) {

    public static <T> PageResponse<T> from(Page<T> page) {
        return new PageResponse<>(
                page.getContent(), page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages());
    }
}
