package kr.io.newlearn.article;

import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.NotFoundException;

// 「없거나 공개 전 기사는 404」 — 기사 상세 · 마인드맵 · 북마크 넣기가 같이 쓰는 서비스 규칙(docs/api.md 1절).
// 규칙은 서비스 층에 두고 리포지토리는 찾기만 한다(docs/backend-convention.md 1절)
public final class ReleasedArticles {

    private ReleasedArticles() {}

    public static Article get(ArticleRepository articles, long articleId) {
        return articles.findByIdAndReleasedAtIsNotNull(articleId)
                .orElseThrow(() -> new NotFoundException(ErrorCode.ARTICLE_NOT_FOUND, "기사를 찾을 수 없다: " + articleId));
    }
}
