import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { ArticleSummary, ItemList } from "@/api/types";

/** A20 · A21 의 응답 — 바뀐 뒤의 북마크 상태. 아이콘은 이 bookmarked 로 맞춘다 (docs/api-screen.md A20 · A21) */
export type BookmarkState = {
  articleId: number;
  bookmarked: boolean;
  /** 담은 시각. 뺐으면 null */
  bookmarkedAt: string | null;
};

/** A22 나의 뉴스함의 항목 — 기사 요약(bookmarked 는 늘 true)에 담은 시각을 더한다 */
export type BookmarkItem = ArticleSummary & { bookmarkedAt: string };

/**
 * A20 북마크 담기. 이미 담긴 기사를 또 담아도 같은 응답이고 담은 시각은 그대로다.
 * 없거나 공개 전 기사는 404 ARTICLE_NOT_FOUND, 손님은 401 UNAUTHORIZED
 */
export function addBookmark(articleId: number) {
  return api
    .put<BookmarkState>(`/members/me/bookmarks/${articleId}`)
    .then((res) => res.data);
}

/** A21 북마크 빼기. 안 담긴 기사나 없는 기사를 빼도 200 이다. 손님은 401 UNAUTHORIZED */
export function removeBookmark(articleId: number) {
  return api
    .delete<BookmarkState>(`/members/me/bookmarks/${articleId}`)
    .then((res) => res.data);
}

/** A22 나의 뉴스함 — 담은 기사 전부, 쪽을 나누지 않는다. 담은 시각 최신순, 같으면 기사 id 내림차순. 손님은 401 */
export function fetchBookmarks() {
  return api
    .get<ItemList<BookmarkItem>>("/members/me/bookmarks")
    .then((res) => res.data.items);
}

export const bookmarksQuery = queryOptions({
  queryKey: ["members", "me", "bookmarks"],
  queryFn: fetchBookmarks,
});
