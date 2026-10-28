package kr.io.newlearn.bookmark;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.List;
import kr.io.newlearn.analysis.AnalysisJobRepository;
import kr.io.newlearn.article.Article;
import kr.io.newlearn.article.ArticleRepository;
import kr.io.newlearn.article.ArticleSummaryAssembler;
import kr.io.newlearn.mindmap.ArticleMindmapRepository;
import kr.io.newlearn.press.Press;
import org.junit.jupiter.api.Test;

class BookmarkServiceTest {
    @Test
    void listKeepsTrueForRowsAlreadyReadEvenIfBookmarkIsConcurrentlyRemoved() {
        var bookmarks = mock(BookmarkRepository.class);
        var mindmaps = mock(ArticleMindmapRepository.class);
        var jobs = mock(AnalysisJobRepository.class);
        var article = mock(Article.class);
        var press = mock(Press.class);
        when(article.getId()).thenReturn(42L);
        when(article.getTitle()).thenReturn("기사");
        when(article.getPress()).thenReturn(press);
        when(press.getCode()).thenReturn("p");
        when(press.getName()).thenReturn("신문");
        when(article.getPublishedAt()).thenReturn(Instant.parse("2026-10-27T00:00:00Z"));
        when(article.getUrl()).thenReturn("https://fixture.invalid/article");
        var saved = mock(Bookmark.class);
        when(saved.getArticle()).thenReturn(article);
        when(saved.getCreatedAt()).thenReturn(Instant.parse("2026-10-27T00:00:00Z"));
        when(bookmarks.findReleasedByMemberId(1L)).thenReturn(List.of(saved));
        // 첫 목록 조회 직후 다른 요청이 해제한 상황: 추가 조회는 더 이상 행을 찾지 못한다.
        when(bookmarks.findArticleIds(1L, List.of(42L))).thenReturn(List.of());
        var service = new BookmarkService(
                bookmarks, mock(ArticleRepository.class), new ArticleSummaryAssembler(mindmaps, jobs, bookmarks));
        var item = service.list(1L).items().getFirst();
        assertThat(item.article().bookmarked()).isTrue();
        assertThat(item.bookmarkedAt().toInstant()).isEqualTo(Instant.parse("2026-10-27T00:00:00Z"));
        verify(bookmarks, never()).findArticleIds(anyLong(), anyList());
    }
}
