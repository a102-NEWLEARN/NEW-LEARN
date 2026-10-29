import { expect, test } from "vitest";
import { fetchArticle } from "@/api/article";
import { fetchArticles } from "@/api/articles";

// 가짜 API 가 docs/api-screen.md A8 대로 답하는지 — 기사 마인드맵 화면의 머리가 이 응답에 기댄다

test("사건 · 이슈로 묶인 기사는 속한 사건과 이슈를 함께 받는다", async () => {
  const article = await fetchArticle(11901);

  expect(article).toMatchObject({
    id: 11901,
    title: "한빛반도체 텍사스 공장 착공식",
    eventMatchStatus: "SUCCEEDED",
    event: { id: 119, label: "착공식" },
    issue: { id: 12, title: "한빛반도체 미국 공장 건설" },
  });
});

test("기사 요약의 칸은 A7 목록의 같은 기사와 같다", async () => {
  const [list, article] = await Promise.all([
    fetchArticles({ category: "economy", size: 100 }),
    fetchArticle(11901),
  ]);

  expect(article).toMatchObject(list.items.find((item) => item.id === 11901)!);
});

test("사건은 찾았지만 이슈가 아직 없는 기사는 issue 가 null 이다", async () => {
  const article = await fetchArticle(402);

  expect(article.eventMatchStatus).toBe("SUCCEEDED");
  expect(article.event).not.toBeNull();
  expect(article.issue).toBeNull();
});

test("사건을 찾는 중인 기사는 사건 · 이슈가 없다", async () => {
  const article = await fetchArticle(401);

  expect(article).toMatchObject({
    eventMatchStatus: "QUEUED",
    event: null,
    issue: null,
  });
});

test("없는 기사는 404 ARTICLE_NOT_FOUND 다", async () => {
  await expect(fetchArticle(999)).rejects.toMatchObject({
    status: 404,
    code: "ARTICLE_NOT_FOUND",
  });
});
