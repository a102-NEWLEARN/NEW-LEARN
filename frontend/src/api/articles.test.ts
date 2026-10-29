import { expect, test } from "vitest";
import { fetchArticles } from "@/api/articles";

// 가짜 API 가 docs/api-screen.md A7 대로 답하는지 — 최신 기사 화면이 이 응답에 기댄다

test("최신 기사를 발행 시각 최신순으로, 같은 시각이면 id 내림차순으로 받는다", async () => {
  const page = await fetchArticles({ size: 100 });

  const order = page.items.map((article) => [article.publishedAt, article.id]);
  const sorted = [...order].sort(
    ([aAt, aId], [bAt, bId]) =>
      String(bAt).localeCompare(String(aAt)) || Number(bId) - Number(aId),
  );
  expect(order).toEqual(sorted);
  // 115번 · 114번 사건의 첫 기사는 같은 시각(2026-08-21 00:00)에 나왔다
  const ids = page.items.map((article) => article.id);
  expect(ids.indexOf(11501)).toBeLessThan(ids.indexOf(11401));
});

test("사건으로 묶인 기사와 묶이지 않은 기사가 함께 온다", async () => {
  const page = await fetchArticles({ category: "economy", size: 100 });

  expect(page.totalElements).toBeLessThanOrEqual(100);
  const ids = page.items.map((article) => article.id);
  expect(ids).toContain(11901);
  expect(ids).toContain(401);
});

test("분야로 거르면 그 분야 기사만 받는다", async () => {
  const page = await fetchArticles({ category: "world", size: 100 });

  expect(page.items.length).toBeGreaterThan(0);
  expect(
    page.items.every((article) => article.category?.code === "world"),
  ).toBe(true);
  expect(page.totalElements).toBe(page.items.length);
});

test("쪽 정보는 자르기 전 전체 개수로 주고, 쪽마다 이어지는 기사를 준다", async () => {
  const [all, second] = await Promise.all([
    fetchArticles({ size: 100 }),
    fetchArticles({ page: 1, size: 5 }),
  ]);

  expect(second.page).toBe(1);
  expect(second.items.map((article) => article.id)).toEqual(
    all.items.slice(5, 10).map((article) => article.id),
  );
  expect(second.totalElements).toBe(all.totalElements);
  expect(second.totalPages).toBe(Math.ceil(all.totalElements / 5));
});

test("인자가 없으면 첫 쪽 20건을 받는다", async () => {
  const page = await fetchArticles();

  expect(page.page).toBe(0);
  expect(page.size).toBe(20);
  expect(page.items).toHaveLength(20);
});

test("없는 분야 코드는 404 CATEGORY_NOT_FOUND 다", async () => {
  await expect(fetchArticles({ category: "nope" })).rejects.toMatchObject({
    status: 404,
    code: "CATEGORY_NOT_FOUND",
  });
});

test("빈 분야 코드도 404 CATEGORY_NOT_FOUND 다 — 전체를 주지 않는다", async () => {
  await expect(fetchArticles({ category: "" })).rejects.toMatchObject({
    status: 404,
    code: "CATEGORY_NOT_FOUND",
  });
});
