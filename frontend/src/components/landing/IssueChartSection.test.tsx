import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { IssueChartSection } from "@/components/landing/IssueChartSection";
import { holdFrames } from "@/test/frames";
import { stubReducedMotion } from "@/test/media";

// 스크롤 연출 ① — 기사 막대가 쌓여 「기사 354건 → 사건 12개」로 (프로토타입 v21)

afterEach(() => vi.restoreAllMocks());

const bars = () => [...document.querySelectorAll<HTMLElement>("[data-bar]")];
const SECOND = "기사 354건, 다 읽지 않아도 사건 12개로 정리해 흐름을 보여줘요.";

test("화면에 붙는 긴 구간이고, 처음에는 「뉴스는 넘쳐나는데,」와 모인 막대 12개만 보인다", () => {
  holdFrames();
  const { container } = render(<IssueChartSection />);
  const section = container.querySelector("section")!;

  expect(section.style.height).toBe("330svh");
  expect(section.firstElementChild?.className).toMatch(/sticky/);
  expect(
    screen.getByRole("heading", { level: 2, name: "뉴스는 넘쳐나는데," }),
  ).toBeDefined();
  // 둘째 문장은 아직 화면 읽기에서도 빠져 있다
  expect(screen.queryByRole("heading", { level: 2, name: SECOND })).toBeNull();
  expect(bars()).toHaveLength(12);
  expect(document.querySelector("[data-highlight]")).toBeNull();
});

test("동작 줄이기를 켜면 화면에 붙이지 않고 마지막 장면 — 둘째 문장, 누적 막대, 기사가 가장 많은 사건 강조", () => {
  stubReducedMotion();
  const { container } = render(<IssueChartSection />);
  const section = container.querySelector("section")!;

  expect(section.style.height).toBe("");
  // 차트 칸은 높이가 정해져 있다 — flex-1 이면 높이 0 으로 접혔다(11-12 화면 확인)
  const chart = bars()[0].parentElement!.parentElement!;
  expect(chart.className).toContain("h-[420px]");
  expect(chart.className).not.toContain("flex-1");
  expect(screen.getByRole("heading", { level: 2, name: SECOND })).toBeDefined();
  expect(bars().at(-1)?.textContent).toContain("354건");
  const highlight = document.querySelector("[data-highlight]")!;
  expect(highlight.textContent).toContain("바이낸스 가상자산 해킹 발생");
  expect(highlight.textContent).toContain("기사 87건");
  expect(highlight.textContent).not.toMatch(/UPDATE/);
});
