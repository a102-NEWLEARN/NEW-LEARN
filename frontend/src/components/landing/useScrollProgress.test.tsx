import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { useScrollProgress } from "@/components/landing/useScrollProgress";
import { holdFrames } from "@/test/frames";
import { stubReducedMotion } from "@/test/media";

// 화면에 붙는 긴 구간을 얼마나 내렸나(0 ~ 1) — 스크롤 연출 ① · ②

afterEach(() => vi.restoreAllMocks());

// 문서 1000px 에서 시작하는 2970px 구간(화면 900px → 내릴 거리 2070px)
function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  const { progress, pinned } = useScrollProgress(ref);
  return (
    <div
      ref={(element) => {
        ref.current = element;
        if (!element) return;
        Object.defineProperty(element, "offsetHeight", { value: 2970 });
        element.getBoundingClientRect = () =>
          ({ top: 1000 - window.scrollY }) as DOMRect;
      }}
      data-testid="probe"
      data-progress={progress.toFixed(3)}
      data-pinned={pinned}
    />
  );
}

const progress = () => Number(screen.getByTestId("probe").dataset.progress);

test("내린 만큼 진행도가 오르고, 한 번에 뛰지 않고 부드럽게 따라간다", () => {
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(900);
  const scrollY = vi.spyOn(window, "scrollY", "get").mockReturnValue(0);
  const frames = holdFrames();
  render(<Probe />);
  act(() => frames.runAt(0));
  expect(progress()).toBe(0);
  expect(screen.getByTestId("probe").dataset.pinned).toBe("true");

  scrollY.mockReturnValue(1000 + 2070 / 2);
  fireEvent.scroll(window);
  act(() => frames.runAt(16));
  const first = progress();
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThan(0.5);

  for (let i = 0; i < 80; i++) act(() => frames.runAt(32 + i * 16));
  expect(progress()).toBeCloseTo(0.5, 2);
});

test("동작 줄이기를 켜면 화면에 붙이지 않고 마지막 장면(1)이다", () => {
  stubReducedMotion();
  const frames = holdFrames();
  render(<Probe />);

  expect(progress()).toBe(1);
  expect(screen.getByTestId("probe").dataset.pinned).toBe("false");
  expect(frames.request).not.toHaveBeenCalled();
});
