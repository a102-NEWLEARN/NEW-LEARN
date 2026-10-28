package kr.io.newlearn.bookmark.dto;

import com.fasterxml.jackson.annotation.JsonUnwrapped;
import java.time.OffsetDateTime;
import java.util.List;
import kr.io.newlearn.article.dto.ArticleSummaryResponse;

// springdoc 은 스키마 이름을 단순 클래스 이름으로 짓는다 — 항목을 Item 으로 두면 같은 모양의 다른 목록(A25 등)과 이름이 겹쳐 한쪽이 덮인다
public record BookmarkListResponse(List<BookmarkItem> items) {
    public record BookmarkItem(@JsonUnwrapped ArticleSummaryResponse article, OffsetDateTime bookmarkedAt) {}
}
