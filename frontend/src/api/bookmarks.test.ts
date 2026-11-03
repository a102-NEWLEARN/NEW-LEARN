import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import { fetchArticle } from "@/api/article";
import { addBookmark, fetchBookmarks, removeBookmark } from "@/api/bookmarks";
import { server } from "@/mocks/node";

// A20 · A21 북마크 담기 · 빼기, A22 나의 뉴스함 (docs/api-screen.md A20 ~ A22)

function unauthorized(instance: string) {
  return HttpResponse.json(
    {
      type: "about:blank",
      title: "UNAUTHORIZED",
      status: 401,
      detail: "UNAUTHORIZED",
      instance,
      code: "UNAUTHORIZED",
    },
    { status: 401 },
  );
}

test("담으면 바뀐 뒤 상태 — 담김과 담은 시각을 받는다", async () => {
  const state = await addBookmark(11901);

  expect(state).toMatchObject({ articleId: 11901, bookmarked: true });
  expect(state.bookmarkedAt).toEqual(expect.any(String));
});

test("없는 기사를 담으면 404 ARTICLE_NOT_FOUND 다", async () => {
  await expect(addBookmark(999)).rejects.toMatchObject({
    status: 404,
    code: "ARTICLE_NOT_FOUND",
  });
});

test("빼면 담기지 않음과 빈 시각을 받는다 — 없는 기사를 빼도 200 이다", async () => {
  const [state, missing] = await Promise.all([
    removeBookmark(11901),
    removeBookmark(999),
  ]);

  expect(state).toEqual({
    articleId: 11901,
    bookmarked: false,
    bookmarkedAt: null,
  });
  expect(missing).toMatchObject({ articleId: 999, bookmarked: false });
});

test("손님이 담으면 401 UNAUTHORIZED 를 던진다", async () => {
  server.use(
    http.put("/api/v1/members/me/bookmarks/:articleId", ({ params }) =>
      unauthorized(`/api/v1/members/me/bookmarks/${params.articleId}`),
    ),
  );

  await expect(addBookmark(11901)).rejects.toMatchObject({
    status: 401,
    code: "UNAUTHORIZED",
  });
});

test("나의 뉴스함은 담은 기사를 담은 시각 최신순으로 받는다", async () => {
  const items = await fetchBookmarks();

  expect(items.length).toBeGreaterThan(0);
  expect(items.every((item) => item.bookmarked)).toBe(true);
  const times = items.map((item) => item.bookmarkedAt);
  expect(times).toEqual([...times].sort().reverse());
});

test("뉴스함에 든 기사는 기사 상세에서도 담긴 것으로 온다", async () => {
  const items = await fetchBookmarks();
  const details = await Promise.all(items.map((item) => fetchArticle(item.id)));

  expect(details.every((article) => article.bookmarked)).toBe(true);
});

test("손님이 나의 뉴스함을 열면 401 UNAUTHORIZED 를 던진다", async () => {
  server.use(
    http.get("/api/v1/members/me/bookmarks", () =>
      unauthorized("/api/v1/members/me/bookmarks"),
    ),
  );

  await expect(fetchBookmarks()).rejects.toMatchObject({
    status: 401,
    code: "UNAUTHORIZED",
  });
});
