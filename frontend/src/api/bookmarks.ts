import { type QueryClient, queryOptions } from "@tanstack/react-query";
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

// 기사는 bookmarked 칸이 있는 객체로 알아본다. 바뀐 것이 없으면 같은 참조를 돌려 화면을 다시 그리지 않게 한다
function patchArticle(
  value: unknown,
  articleId: number,
  bookmarked: boolean,
): unknown {
  if (Array.isArray(value)) {
    const next = value.map((item) => patchArticle(item, articleId, bookmarked));
    return next.some((item, at) => item !== value[at]) ? next : value;
  }
  if (value === null || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if ("bookmarked" in record && record.id === articleId)
    return record.bookmarked === bookmarked ? value : { ...record, bookmarked };
  let next: Record<string, unknown> | null = null;
  for (const [key, child] of Object.entries(record)) {
    const patched = patchArticle(child, articleId, bookmarked);
    if (patched !== child) (next ??= { ...record })[key] = patched;
  }
  return next ?? value;
}

/**
 * 담기 · 빼기가 끝나면 받아 둔 기사 응답 — 최신 기사(A7) · 사건 관련 기사(A6) · 기사 상세(A8) — 에서 이 기사의 bookmarked 를
 * 응답대로 바꾼다. 나의 뉴스함(A22)은 들고 나는 기사가 달라져서 새로 받게 한다
 */
export function setBookmarked(
  queryClient: QueryClient,
  articleId: number,
  bookmarked: boolean,
) {
  for (const queryKey of [["articles"], ["event"], ["article", articleId]]) {
    queryClient.setQueriesData({ queryKey }, (data: unknown) =>
      patchArticle(data, articleId, bookmarked),
    );
  }
  void queryClient.invalidateQueries({ queryKey: bookmarksQuery.queryKey });
}
