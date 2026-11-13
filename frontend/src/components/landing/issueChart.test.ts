import { expect, test } from "vitest";
import { chartFrame, CHART } from "@/components/landing/issueChart";

// 스크롤 연출 ① — 진행도(0 ~ 1)에 따른 장면 (프로토타입 v21 LandingScreen 의 cp 계산)

test("예시 이슈의 사건 12개 · 기사 354건을 쌓아 가고, 기사가 가장 많은 사건을 강조한다", () => {
  expect(CHART.events).toHaveLength(12);
  expect(CHART.total).toBe(354);
  expect(CHART.cumulative.at(-1)).toBe(354);
  expect(CHART.events[CHART.highlight].id).toBe(1450);
});

test("처음에는 막대가 가운데에 모여 들쭉날쭉하고, 글 · 강조는 없고 첫 문장이다", () => {
  const frame = chartFrame(0);

  expect(frame.step).toBe(0);
  expect(frame.labels).toBe(0);
  expect(frame.highlight).toBe(0);
  const lefts = frame.bars.map((bar) => bar.left);
  expect(Math.min(...lefts)).toBeGreaterThan(5);
  expect(Math.max(...lefts)).toBeLessThan(95);
  frame.bars.forEach((bar) => expect(bar.width).toBeCloseTo(7.2));
});

test("끝에는 막대가 폭을 나눠 채우고 누적 기사 수만큼 계단으로 올라가며, 글 · 강조가 다 보이고 둘째 문장이다", () => {
  const frame = chartFrame(1);

  expect(frame.step).toBe(1);
  expect(frame.labels).toBe(1);
  expect(frame.highlight).toBe(1);
  frame.bars.forEach((bar, i) => {
    expect(bar.left).toBeCloseTo((i * 100) / 12);
    expect(bar.width).toBeCloseTo(100 / 12);
    expect(bar.height).toBeCloseTo((CHART.cumulative[i] / 354) * 86);
  });
  const heights = frame.bars.map((bar) => bar.height);
  heights
    .slice(1)
    .forEach((h, i) => expect(h).toBeGreaterThanOrEqual(heights[i]));
});

test("차례 — 첫 문장이 빠지고(0.25 ~ 0.33) 둘째가 들어온 뒤(0.33 ~ 0.41) 막대가 펼쳐지고(0.42 ~ 0.62) 글(0.64 ~)과 강조(0.78 ~)가 나온다", () => {
  expect(chartFrame(0.3).captionOut).toBeGreaterThan(0);
  expect(chartFrame(0.3).captionIn).toBe(0);
  expect(chartFrame(0.4).captionIn).toBeGreaterThan(0);
  expect(chartFrame(0.41).spread).toBe(0);
  expect(chartFrame(0.5).spread).toBeGreaterThan(0);
  expect(chartFrame(0.63).labels).toBe(0);
  expect(chartFrame(0.68).labels).toBeGreaterThan(0);
  expect(chartFrame(0.77).highlight).toBe(0);
  expect(chartFrame(0.82).highlight).toBeGreaterThan(0);
});
