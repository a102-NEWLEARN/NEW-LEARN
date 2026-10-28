package kr.io.newlearn.article.dto;

import java.time.OffsetDateTime;
import kr.io.newlearn.category.dto.CategoryRef;
import org.jspecify.annotations.Nullable;

// A6·A7·A22의 항목과 A8의 공통 필드. 49번에서도 ArticleSummaryAssembler와 함께 사용한다.
public record ArticleSummaryResponse(
        long id,
        String title,
        PublisherRef publisher,
        OffsetDateTime publishedAt,
        @Nullable CategoryRef category,
        @Nullable String summary,
        String url,
        ArticleAnalysisStatus mindmapStatus,
        boolean bookmarked) {
    public record PublisherRef(String code, String name) {}
}
