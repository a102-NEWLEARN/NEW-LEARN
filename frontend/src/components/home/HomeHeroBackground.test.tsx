import { render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { HomeHeroBackground } from "@/components/home/HomeHeroBackground";
import { holdFrames, stubOnScreen } from "@/test/frames";
import { expectMotionSafe } from "@/test/motion";

// 홈 첫 화면 뒤 마인드맵 모양 배경 — 프로토타입 v21 HomeHeroBg (Jira 168)

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const nodePositions = (container: HTMLElement) =>
  [...container.querySelectorAll("rect")].map((rect) => [
    rect.getAttribute("x"),
    rect.getAttribute("y"),
  ]);

test("장식이라 화면 읽기에서 빠지고, 노드 22개를 가까운 것끼리 선으로 잇는다", () => {
  holdFrames();
  const { container } = render(<HomeHeroBackground />);

  const svg = container.querySelector("svg");
  expect(svg?.getAttribute("aria-hidden")).toBe("true");
  expect(container.querySelectorAll("rect")).toHaveLength(22);
  expect(container.querySelectorAll("line").length).toBeGreaterThan(0);
});

test("화면에 보이면 시간이 지나며 노드가 조금씩 자리를 옮긴다", () => {
  stubOnScreen(true);
  const frames = holdFrames();
  const { container } = render(<HomeHeroBackground />);
  const before = nodePositions(container);

  frames.runAt(1000);
  frames.runAt(6000);

  expect(nodePositions(container)).not.toEqual(before);
});

test("화면 밖이면 움직이지 않는다 — 홈을 아래로 내린 때", () => {
  stubOnScreen(false);
  const frames = holdFrames();

  render(<HomeHeroBackground />);

  expect(frames.request).not.toHaveBeenCalled();
});

test("보이는지 알 수 없으면(IntersectionObserver 가 없으면) 멈춘 그림으로 둔다", () => {
  const frames = holdFrames();

  render(<HomeHeroBackground />);

  expect(frames.request).not.toHaveBeenCalled();
});

test("동작 줄이기를 켜면 화면에 보여도 움직이지 않는다", () => {
  stubOnScreen(true);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const frames = holdFrames();

  render(<HomeHeroBackground />);

  expect(frames.request).not.toHaveBeenCalled();
});

test("열면 그림 전체가 520ms 에 걸쳐 천천히 나타난다 — 동작 줄이기면 빠진다", () => {
  holdFrames();
  const { container } = render(<HomeHeroBackground />);

  // 프로토타입 v21 HomeHeroBg — svg im-fade-in 520ms ease-out
  expect(container.querySelector("svg")?.getAttribute("class")).toMatch(
    /motion-safe:animate-\[newlearn-fade-in_520ms_/,
  );
  expectMotionSafe(container);
});
