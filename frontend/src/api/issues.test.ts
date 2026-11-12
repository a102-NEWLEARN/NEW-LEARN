import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { fetchIssues, ISSUES_PAGE_SIZE, issuesPagesQuery } from "@/api/issues";

// 가짜 API 가 docs/api-screen.md A2 대로 답하는지 — 화면 테스트가 이 응답에 기댄다

test("분야로 거른 이슈를 마지막 사건 최신순으로 받는다", async () => {
  const page = await fetchIssues({ category: "economy" });

  expect(page.items.map((issue) => issue.id)).toEqual([15, 13, 12, 14]);
  expect(
    page.items.every((issue) =>
      issue.categories.some((category) => category.code === "economy"),
    ),
  ).toBe(true);
});

test("쪽 정보는 자르기 전 전체 개수로 준다", async () => {
  const page = await fetchIssues({ category: "economy", size: 2 });

  expect(page.items).toHaveLength(2);
  expect(page.totalElements).toBe(4);
  expect(page.totalPages).toBe(2);
});

test("sort=createdAt 이면 새로 생긴 이슈부터 받는다", async () => {
  const page = await fetchIssues({ sort: "createdAt", size: 3 });

  expect(page.items.map((issue) => issue.id)).toEqual([21, 12, 41]);
});

test("모르는 sort 값은 400 VALIDATION_FAILED 다", async () => {
  await expect(
    fetchIssues({ sort: "title" as "createdAt" }),
  ).rejects.toMatchObject({ status: 400, code: "VALIDATION_FAILED" });
});

test("없는 분야 코드는 404 CATEGORY_NOT_FOUND 다", async () => {
  await expect(fetchIssues({ category: "nope" })).rejects.toMatchObject({
    status: 404,
    code: "CATEGORY_NOT_FOUND",
  });
});

test("분야별 이슈 화면 쿼리는 12개씩 받고, 마지막 쪽이면 다음 쪽이 없다", async () => {
  const queryClient = new QueryClient();
  const data = await queryClient.fetchInfiniteQuery(
    issuesPagesQuery("economy"),
  );

  expect(ISSUES_PAGE_SIZE).toBe(12);
  expect(data.pages[0].size).toBe(12);
  expect(data.pages[0].items.map((issue) => issue.id)).toEqual([
    15, 13, 12, 14,
  ]);
  expect(
    issuesPagesQuery("economy").getNextPageParam?.(
      data.pages[0],
      data.pages,
      0,
      [0],
    ),
  ).toBeUndefined();
});
