import { expect, test } from "vitest";
import { fetchIssues } from "@/api/issues";
import { fetchTimeline } from "@/api/timeline";

// 가짜 API 가 docs/api-screen.md A4 대로 답하는지 — 타임라인 테스트가 이 응답에 기댄다

test("이슈의 사건을 발생 시각 오름차순으로 한 번에 받는다", async () => {
  const timeline = await fetchTimeline(12);

  expect(timeline.issueId).toBe(12);
  expect(timeline.events.map((event) => event.label)).toEqual([
    "후보지 검토",
    "공식 발표",
    "세제 혜택",
    "용수 우려",
    "보조금 확정",
    "추가 투자 승인",
    "착공식",
    "인력 수급 우려",
  ]);
  const times = timeline.events.map((event) => event.occurredAt);
  expect(times).toEqual([...times].sort());
});

test("레인을 정한 사건과 정하지 않은(null) 사건이 있다", async () => {
  const [decided, undecided] = await Promise.all([
    fetchTimeline(12),
    fetchTimeline(13),
  ]);

  expect(new Set(decided.events.map((event) => event.lane))).toEqual(
    new Set(["MAIN", "SUB"]),
  );
  expect(undecided.events.every((event) => event.lane === null)).toBe(true);
});

test("마지막 사건과 사건 · 기사 수가 A2 이슈 목록과 같다", async () => {
  const [timeline, page] = await Promise.all([
    fetchTimeline(12),
    fetchIssues({ category: "economy" }),
  ]);
  const issue = page.items.find((item) => item.id === 12)!;
  const last = timeline.events.at(-1)!;

  expect(issue.lastEvent).toEqual({
    id: last.id,
    title: last.title,
    label: last.label,
    occurredAt: last.occurredAt,
  });
  expect(issue.eventCount).toBe(timeline.events.length);
  expect(issue.articleCount).toBe(
    timeline.events.reduce((sum, event) => sum + event.articleCount, 0),
  );
});

test("없는 이슈는 404 ISSUE_NOT_FOUND 다", async () => {
  await expect(fetchTimeline(999)).rejects.toMatchObject({
    status: 404,
    code: "ISSUE_NOT_FOUND",
  });
});
