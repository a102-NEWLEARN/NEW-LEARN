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

// 레인은 사건의 역할로 늘 값이 있다 — 상황을 바꾸는 행위는 MAIN, 반응 · 평가 · 여론은 SUB (A4, Jira 130)
test.each([12, 13])(
  "%i번 이슈의 사건은 모두 레인이 있고 메인 · 서브가 섞여 있다",
  async (issueId) => {
    const { events } = await fetchTimeline(issueId);

    expect(new Set(events.map((event) => event.lane))).toEqual(
      new Set(["MAIN", "SUB"]),
    );
  },
);

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
