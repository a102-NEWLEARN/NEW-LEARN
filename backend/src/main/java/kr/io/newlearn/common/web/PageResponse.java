package kr.io.newlearn.common.web;

import java.util.List;
import org.springframework.data.domain.Page;

// 목록 응답 모양 (docs/api.md 1절 「목록 응답」). Spring Data 의 Page 를 그대로 내보내지 않고 이 모양으로 옮긴다
// 예: PageResponse.from(articlePage.map(ArticleSummary::from)). 행 묶음을 한꺼번에 조립하면 PageResponse.of(page, 조립한 항목)
public record PageResponse<T>(List<T> items, int page, int size, long totalElements, int totalPages) {

    public static <T> PageResponse<T> from(Page<T> page) {
        return of(page, page.getContent());
    }

    // 쪽 번호 · 크기 · 전체 수는 읽은 page 에서, 항목은 그 page 의 행을 조립한 것으로 (ArticleSummaryAssembler · IssueCardAssembler)
    public static <T> PageResponse<T> of(Page<?> page, List<T> items) {
        return new PageResponse<>(
                items, page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages());
    }
}
