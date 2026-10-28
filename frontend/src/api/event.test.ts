import { expect, test } from "vitest";
import { fetchEvent } from "@/api/event";

// 가짜 API 가 docs/api-screen.md A5 대로 답하는지 — 사건 패널 테스트가 이 응답에 기댄다

test("사건 패널을 받는다 — 속한 이슈 · 언론사 · 이전 · 다음 사건", async () => {
  const event = await fetchEvent(119);

  expect(event).toMatchObject({
    id: 119,
    title: "한빛반도체 텍사스 공장 착공식",
    label: "착공식",
    occurredAtBasis: "EXTRACTED",
    issue: { id: 12, title: "한빛반도체 미국 공장 건설" },
    articleCount: 5,
    previousEvent: { id: 118, label: "추가 투자 승인" },
    nextEvent: { id: 120, label: "인력 수급 우려" },
  });
  expect(event.publishers).toHaveLength(4);
  const codes = event.publishers.map((publisher) => publisher.code);
  expect(codes).toEqual([...codes].sort());
});

test("이슈의 첫 사건은 이전이, 마지막 사건은 다음이 없다", async () => {
  const [first, last] = await Promise.all([fetchEvent(113), fetchEvent(120)]);

  expect(first.previousEvent).toBeNull();
  expect(last.nextEvent).toBeNull();
});

test("없는 사건은 404 EVENT_NOT_FOUND 다", async () => {
  await expect(fetchEvent(999)).rejects.toMatchObject({
    status: 404,
    code: "EVENT_NOT_FOUND",
  });
});
