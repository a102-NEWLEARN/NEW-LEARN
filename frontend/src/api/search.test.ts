import { expect, test } from "vitest";
import { fetchSearch } from "@/api/search";

// 가짜 A13 이 docs/api-screen.md A13 규칙대로 답하는지 — 제목만 · 유형마다 최신순 20개 · 검색어 1 ~ 50자

test("검색어가 든 이슈 · 사건 · 기사를 묶음별로 받는다", async () => {
  const result = await fetchSearch("공장");

  expect(result.issues).toEqual([
    { id: 12, title: "한빛반도체 미국 공장 건설" },
  ]);
  expect(result.events).toEqual([
    { id: 120, title: "텍사스 공장 엔지니어 수급 우려 보도", issueId: 12 },
  ]);
  // 발행 시각 최신순 — 402(10-09) 가 401(10-06) 보다 앞
  expect(result.articles.map((article) => article.id)).toEqual([402, 401]);
});

test("제목만 찾는다 — 요약에만 있는 말로는 아무것도 나오지 않는다", async () => {
  // 기사 402 의 요약에만 「숙련」이, 12번 이슈 · 기사 401 의 요약에만 「투자」가 있다
  for (const word of ["숙련", "투자"]) {
    await expect(fetchSearch(word)).resolves.toEqual({
      issues: [],
      events: [],
      articles: [],
    });
  }
});

test.each([
  ["빈 검색어", "  ", "검색어를 입력해 주세요"],
  ["50자 넘는 검색어", "가".repeat(51), "검색어는 50자까지예요"],
])("%s는 400 과 까닭을 준다", async (_, q, reason) => {
  await expect(fetchSearch(q)).rejects.toMatchObject({
    status: 400,
    code: "VALIDATION_FAILED",
    errors: [{ field: "q", reason }],
  });
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
