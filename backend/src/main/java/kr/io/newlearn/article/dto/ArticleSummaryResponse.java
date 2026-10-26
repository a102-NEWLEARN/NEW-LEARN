package kr.io.newlearn.article.dto;

import java.time.OffsetDateTime;
import kr.io.newlearn.category.dto.CategoryRef;

// A6·A7의 항목과 A8의 공통 필드. 49번에서도 ArticleSummaryAssembler와 함께 사용한다.
public record ArticleSummaryResponse(
        long id,
        String title,
        PublisherRef publisher,
        OffsetDateTime publishedAt,
        CategoryRef category,
        String summary,
        String url,
        ArticleAnalysisStatus mindmapStatus) {
    public record PublisherRef(String code, String name) {}
}
