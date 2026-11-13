import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import {
  addInterestIssue,
  fetchInterestIssues,
  removeInterestIssue,
  setInterested,
} from "@/api/interestIssues";
import { fetchIssue } from "@/api/issue";
import { fetchIssues, issuesAllQuery } from "@/api/issues";

// 가짜 API 가 docs/api-screen.md A23 ~ A25 대로 답하는지 — 별 · 마이페이지 관심 이슈가 이 응답에 기댄다

test("저장하면 바뀐 상태를 받고, 이미 저장한 이슈면 저장한 시각이 그대로다", async () => {
  await expect(addInterestIssue(12)).resolves.toEqual({
    issueId: 12,
    interested: true,
    interestedAt: "2026-10-27T08:30:00+09:00",
  });
  const fresh = await addInterestIssue(13);
  expect(fresh.interested).toBe(true);
  expect(fresh.interestedAt).not.toBeNull();
});

test("없는 이슈를 저장하려 하면 404 ISSUE_NOT_FOUND 다", async () => {
  await expect(addInterestIssue(9999)).rejects.toMatchObject({
    status: 404,
    code: "ISSUE_NOT_FOUND",
  });
});

test("해제는 이슈를 확인하지 않고 해제한 상태를 준다", async () => {
  await expect(removeInterestIssue(9999)).resolves.toEqual({
    issueId: 9999,
    interested: false,
    interestedAt: null,
  });
});

test("목록은 저장한 시각 최신순이고 항목은 이슈 카드에 저장한 시각을 더한 모양이다", async () => {
  const items = await fetchInterestIssues();

  expect(items.map((item) => item.id)).toEqual([12, 21]);
  expect(items.every((item) => item.interested)).toBe(true);
  expect(items[0].interestedAt).toBe("2026-10-27T08:30:00+09:00");
  expect(items[0].lastEvent).not.toBeNull();
});

test("이슈 응답(A2 · A3)의 interested 도 저장한 표를 따른다", async () => {
  const page = await fetchIssues({ size: 100 });
  const interested = page.items
    .filter((item) => item.interested)
    .map((item) => item.id)
    .sort((a, b) => a - b);

  expect(interested).toEqual([12, 21]);
  expect((await fetchIssue(12)).interested).toBe(true);
  expect((await fetchIssue(13)).interested).toBe(false);
});

test("별을 누르면 분야별 이슈 화면이 모아 둔 목록에서도 그 이슈의 interested 를 바꾼다", async () => {
  const queryClient = new QueryClient();
  const query = issuesAllQuery("economy");
  const data = await queryClient.fetchQuery(query);
  expect(data.items.find((item) => item.id === 13)?.interested).toBe(false);

  setInterested(queryClient, 13, true);

  const items = queryClient.getQueryData(query.queryKey)?.items ?? [];
  expect(items.find((item) => item.id === 13)?.interested).toBe(true);
  // 다른 이슈는 그대로다
  expect(items.find((item) => item.id === 15)?.interested).toBe(false);
});
