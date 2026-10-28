import { expect, test } from "vitest";
import { fetchEventArticles } from "@/api/eventArticles";

// 가짜 API 가 docs/api-screen.md A6 대로 답하는지

test("관련 기사를 발행 시각 오름차순으로 쪽을 나눠 받는다", async () => {
  const [first, second] = await Promise.all([
    fetchEventArticles(117, 0, 5),
    fetchEventArticles(117, 1, 5),
  ]);

  expect(first.items).toHaveLength(5);
  expect(first.totalElements).toBe(6);
  expect(first.totalPages).toBe(2);
  expect(second.items).toHaveLength(1);
  const times = [...first.items, ...second.items].map(
    (article) => article.publishedAt,
  );
  expect(times).toEqual([...times].sort());
});

test("기사 요약 모양으로 받는다 — 언론사 · 원문 주소 · 마인드맵 상태", async () => {
  const { items } = await fetchEventArticles(119, 0, 5);

  expect(items[0]).toMatchObject({
    publisher: { code: expect.any(String), name: expect.any(String) },
    url: expect.stringMatching(/^https:\/\//),
    mindmapStatus: "SUCCEEDED",
    bookmarked: false,
  });
});

test("없는 사건은 404 EVENT_NOT_FOUND 다", async () => {
  await expect(fetchEventArticles(999, 0, 5)).rejects.toMatchObject({
    status: 404,
    code: "EVENT_NOT_FOUND",
  });
});
