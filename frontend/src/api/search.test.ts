import { expect, test } from "vitest";
import { fetchSearch } from "@/api/search";

// 가짜 A13 — 우리가 가진 뉴스 데이터 가운데 검색어가 들어간 것을 준다 (docs/api-screen.md A13 모양)

test("검색어가 든 이슈 · 사건 · 기사를 묶음별로 받는다", async () => {
  const result = await fetchSearch("공장");

  expect(result.issues).toEqual([
    { id: 12, title: "한빛반도체 미국 공장 건설" },
  ]);
  expect(result.events).toEqual([
    { id: 120, title: "텍사스 공장 엔지니어 수급 우려 보도", issueId: 12 },
  ]);
  expect(result.articles.map((article) => article.id)).toEqual([401, 402]);
});

test("기사는 요약에만 검색어가 있어도 나온다", async () => {
  const result = await fetchSearch("숙련");

  expect(result.issues).toEqual([]);
  expect(result.events).toEqual([]);
  expect(result.articles).toEqual([
    { id: 402, title: "美 공장 인력난에 국내 엔지니어 파견 검토" },
  ]);
});

test("영문은 대소문자를 가리지 않는다", async () => {
  const result = await fetchSearch("ai");

  expect(result.issues.map((issue) => issue.id)).toEqual([51]);
  expect(result.articles.map((article) => article.id)).toEqual([408]);
});

test("맞는 것이 없으면 세 묶음이 다 빈다", async () => {
  await expect(fetchSearch("없는말")).resolves.toEqual({
    issues: [],
    events: [],
    articles: [],
  });
});
