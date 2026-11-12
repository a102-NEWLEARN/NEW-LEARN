import { render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { LandingHeroMap } from "@/components/landing/LandingHeroMap";
import { holdFrames, stubOnScreen } from "@/test/frames";
import { stubReducedMotion } from "@/test/media";
import { enterDelay, expectMotionSafe } from "@/test/motion";

// 랜딩 첫 화면 뒤 노드 그물 — 프로토타입 v21 LandingHeroMap

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const nodes = (root: HTMLElement) => [
  ...root.querySelectorAll<SVGRectElement>("rect"),
];
const lines = (root: HTMLElement) => [
  ...root.querySelectorAll<SVGLineElement>("line"),
];
const pulses = (root: HTMLElement) => [
  ...root.querySelectorAll<SVGGElement>("[data-pulse]"),
];
const positions = (root: HTMLElement) =>
  nodes(root).map((node) => [node.getAttribute("x"), node.getAttribute("y")]);

test("장식이라 화면 읽기에서 빠지고, 노드를 가까운 것끼리 잇고 민트 점 셋을 둔다", () => {
  holdFrames();
  const { container } = render(<LandingHeroMap />);

  expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
    "true",
  );
  expect(nodes(container).length).toBeGreaterThan(30);
  expect(lines(container).length).toBeGreaterThan(30);
  expect(pulses(container)).toHaveLength(3);
});

test("열면 선이 차례로 그려지고 노드가 차례로 튀어나온다 — 동작 줄이기면 빠지는 움직임이다", () => {
  holdFrames();
  const { container } = render(<LandingHeroMap />);

  const drawn = lines(container);
  drawn.forEach((line) => {
    expect(line.getAttribute("class")).toMatch(
      /motion-safe:animate-\[newlearn-draw_900ms_/,
    );
    expect(line.getAttribute("pathLength")).toBe("1");
  });
  const lineDelays = drawn.map(enterDelay);
  lineDelays
    .slice(1)
    .forEach((at, i) => expect(at).toBeGreaterThan(lineDelays[i]));

  const popped = nodes(container);
  popped.forEach((node) =>
    expect(node.getAttribute("class")).toMatch(
      /motion-safe:animate-\[newlearn-spring-in_520ms_/,
    ),
  );
  const nodeDelays = popped.map(enterDelay);
  nodeDelays
    .slice(1)
    .forEach((at, i) => expect(at).toBeGreaterThan(nodeDelays[i]));
  expectMotionSafe(container);
});

test("화면에 보이면 노드가 떠다니고, 1.6초부터 민트 점이 선을 따라 달리며 그 선을 밝힌다", () => {
  stubOnScreen(true);
  const frames = holdFrames();
  const { container } = render(<LandingHeroMap />);
  const before = positions(container);

  frames.runAt(0);
  frames.runAt(1000);
  expect(positions(container)).not.toEqual(before);
  // 1.6초 전에는 점이 없다
  expect(
    pulses(container).every((p) => p.getAttribute("opacity") === "0"),
  ).toBe(true);

  frames.runAt(2500);
  expect(
    pulses(container).some((p) => Number(p.getAttribute("opacity")) > 0),
  ).toBe(true);
  expect(lines(container).some((line) => line.dataset.on === "true")).toBe(
    true,
  );
});

test("화면 밖이면 움직이지 않는다 — 랜딩을 아래로 내린 때", () => {
  stubOnScreen(false);
  const frames = holdFrames();
  render(<LandingHeroMap />);

  expect(frames.request).not.toHaveBeenCalled();
});

test("동작 줄이기를 켜면 멈춘 그림이다", () => {
  stubOnScreen(true);
  stubReducedMotion();
  const frames = holdFrames();
  render(<LandingHeroMap />);

  expect(frames.request).not.toHaveBeenCalled();
});
