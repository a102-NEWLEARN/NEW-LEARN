import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { FlowPreview } from "@/components/landing/FlowPreview";
import { SAMPLE_BRANCHES } from "@/components/landing/landingSample";
import { MindmapPreview } from "@/components/landing/MindmapPreview";
import { holdFrames, stubOnScreen } from "@/test/frames";
import { stubReducedMotion } from "@/test/media";
import { expectMotionSafe } from "@/test/motion";

// 스크롤 연출 ② 끝의 흐름지도 · 마인드맵 미리보기 (프로토타입 v21 LandingFlowPreview · LandingMindmapHero)

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const LEAVES = SAMPLE_BRANCHES.flatMap((branch) => branch.items);
// 미리보기 아래 강조한 잎 — 가지 이름과 잎 글, AI 생성 표시
const detail = () => document.querySelector("[data-detail]")!;

test("흐름지도 미리보기 — 가지 넷을 번호 · 질문으로, 잎을 칩으로 보이고 2.6초마다 강조한 잎이 바뀐다", () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  render(<FlowPreview />);

  expect(screen.getByText("기사 흐름지도")).toBeDefined();
  expect(screen.getAllByRole("listitem")).toHaveLength(4);
  expect(screen.getByText("왜 일어났나?")).toBeDefined();
  expect(detail().textContent).toContain(LEAVES[0]);
  expect(detail().textContent).toContain("AI 생성");
  expect(detail().textContent).not.toMatch(/원문 근거|문단/);

  act(() => vi.advanceTimersByTime(2600));
  expect(detail().textContent).toContain(LEAVES[1]);
  expectMotionSafe();
});

test("흐름지도 미리보기 — 칩에 마우스를 올리면 그 잎을 강조하고 멈춘다", () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  render(<FlowPreview />);
  const chip = screen.getByRole("button", { name: LEAVES[3] });

  fireEvent.mouseEnter(chip);
  expect(detail().textContent).toContain(LEAVES[3]);
  act(() => vi.advanceTimersByTime(2600 * 3));
  expect(detail().textContent).toContain(LEAVES[3]);
  expect(chip.getAttribute("aria-pressed")).toBe("true");
});

test("마인드맵 미리보기 — 가운데 · 가지 넷 · 잎이 차례로 그려지고 2.8초마다 강조한 잎이 바뀐다", () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  holdFrames();
  render(<MindmapPreview />);

  const svg = document.querySelector("svg")!;
  expect(svg.querySelectorAll("[data-leaf]")).toHaveLength(LEAVES.length);
  expect(svg.querySelectorAll("[data-branch]")).toHaveLength(4);
  expect(svg.textContent).toContain("원인·배경");
  // 긴 잎 글은 11자에서 줄인다
  expect(svg.textContent).toContain(`${[...LEAVES[2]].slice(0, 10).join("")}…`);
  expect(detail().textContent).toContain(LEAVES[0]);

  act(() => vi.advanceTimersByTime(2800));
  expect(detail().textContent).toContain(LEAVES[1]);
  expectMotionSafe(svg);
});

test("동작 줄이기를 켜면 미리보기가 저절로 바뀌지 않고 마인드맵도 떠다니지 않는다", () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  stubReducedMotion();
  const frames = holdFrames();
  render(<MindmapPreview />);

  act(() => vi.advanceTimersByTime(2800 * 2));
  expect(detail().textContent).toContain(LEAVES[0]);
  expect(frames.request).not.toHaveBeenCalled();
});

test("마인드맵 미리보기 — 잎에 키보드로 오면 그 잎을 강조하고 멈추며, 포커스 고리를 그린다", () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  holdFrames();
  render(<MindmapPreview />);
  const leaf = screen.getByRole("button", { name: LEAVES[4] });

  act(() => (leaf as unknown as HTMLElement).focus());
  expect(detail().textContent).toContain(LEAVES[4]);
  expect(leaf.getAttribute("aria-pressed")).toBe("true");
  expect(leaf.querySelector("[data-focus-ring]")).not.toBeNull();
  act(() => vi.advanceTimersByTime(2800 * 2));
  expect(detail().textContent).toContain(LEAVES[4]);
});

test("미리보기가 화면 밖이면 잎이 바뀌지 않고 마인드맵도 떠다니지 않는다 — 랜딩을 아래로 내린 때", () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  stubOnScreen(false);
  const frames = holdFrames();
  render(<MindmapPreview />);
  render(<FlowPreview />);

  act(() => vi.advanceTimersByTime(2800 * 2));
  document
    .querySelectorAll("[data-detail]")
    .forEach((panel) => expect(panel.textContent).toContain(LEAVES[0]));
  expect(frames.request).not.toHaveBeenCalled();
});
