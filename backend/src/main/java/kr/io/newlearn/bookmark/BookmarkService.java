package kr.io.newlearn.bookmark;

import java.util.ArrayList;
import java.util.stream.Collectors;
import kr.io.newlearn.article.ArticleRepository;
import kr.io.newlearn.article.ArticleSummaryAssembler;
import kr.io.newlearn.bookmark.dto.BookmarkListResponse;
import kr.io.newlearn.bookmark.dto.BookmarkStateResponse;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.NotFoundException;
import kr.io.newlearn.common.web.ApiTime;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class BookmarkService {
    private final BookmarkRepository bookmarks;
    private final ArticleRepository articles;
    private final ArticleSummaryAssembler summaries;

    public BookmarkService(
            BookmarkRepository bookmarks, ArticleRepository articles, ArticleSummaryAssembler summaries) {
        this.bookmarks = bookmarks;
        this.articles = articles;
        this.summaries = summaries;
    }

    @Transactional
    public BookmarkStateResponse add(long memberId, long articleId) {
        var article = articles.findByIdAndReleasedAtIsNotNull(articleId)
                .orElseThrow(() -> new NotFoundException(ErrorCode.ARTICLE_NOT_FOUND, "기사를 찾을 수 없다: " + articleId));
        bookmarks.insertIfAbsent(memberId, article.getId());
        // INSERT 충돌을 기다린 다음 문장에서 읽어 기존 담은 시각을 그대로 반환한다.
        var bookmark = bookmarks.findById(new BookmarkId(memberId, articleId)).orElseThrow();
        return new BookmarkStateResponse(articleId, true, ApiTime.toKst(bookmark.getCreatedAt()));
    }

    @Transactional
    public BookmarkStateResponse remove(long memberId, long articleId) {
        bookmarks.remove(memberId, articleId);
        return new BookmarkStateResponse(articleId, false, null);
    }

    public BookmarkListResponse list(long memberId) {
        var saved = bookmarks.findReleasedByMemberId(memberId);
        var articles = saved.stream().map(Bookmark::getArticle).toList();
        var assembled = summaries.assembleWithBookmarks(
                articles, articles.stream().map(a -> a.getId()).collect(Collectors.toSet()));
        var items = new ArrayList<BookmarkListResponse.Item>(saved.size());
        for (int i = 0; i < saved.size(); i++) {
            items.add(new BookmarkListResponse.Item(
                    assembled.get(i), ApiTime.toKst(saved.get(i).getCreatedAt())));
        }
        return new BookmarkListResponse(items);
    }
}
