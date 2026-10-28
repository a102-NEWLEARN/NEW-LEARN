package kr.io.newlearn.bookmark.dto;

import com.fasterxml.jackson.annotation.JsonUnwrapped;
import java.time.OffsetDateTime;
import java.util.List;
import kr.io.newlearn.article.dto.ArticleSummaryResponse;

public record BookmarkListResponse(List<Item> items) {
    public record Item(@JsonUnwrapped ArticleSummaryResponse article, OffsetDateTime bookmarkedAt) {}
}
