import { expect, test } from "vitest";
import { fetchIssue } from "@/api/issue";

// 가짜 API 가 docs/api-screen.md A3 대로 답하는지 — 이슈 화면 테스트가 이 응답에 기댄다

test("이슈 헤더를 A2 항목에서 lastEvent 만 뺀 모양으로 받는다", async () => {
  const issue = await fetchIssue(12);

  expect(issue).toMatchObject({
    id: 12,
    title: "한빛반도체 미국 공장 건설",
    categories: [{ code: "economy", name: "경제" }],
    eventCount: 8,
    articleCount: 31,
    firstEventAt: "2026-08-04T00:00:00+09:00",
    lastEventAt: "2026-10-09T08:41:00+09:00",
  });
  expect(issue).not.toHaveProperty("lastEvent");
});

test("없는 이슈는 404 ISSUE_NOT_FOUND 다", async () => {
  await expect(fetchIssue(999)).rejects.toMatchObject({
    status: 404,
    code: "ISSUE_NOT_FOUND",
  });
});
