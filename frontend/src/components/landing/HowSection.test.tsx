import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { HowSection } from "@/components/landing/HowSection";
import { SAMPLE_EVENT_ARTICLES } from "@/components/landing/landingSample";
import { holdFrames } from "@/test/frames";
import { stubReducedMotion } from "@/test/media";

// 스크롤 연출 ② — 기사 → 사건 → 이슈 흐름 → 흐름지도 · 마인드맵 (프로토타입 v21)

afterEach(() => vi.restoreAllMocks());

test("화면에 붙는 긴 구간이고, 처음에는 흩어진 기사 카드 다섯과 「기사 87건이」만 보인다", () => {
  holdFrames();
  const { container } = render(<HowSection />);
  const section = container.querySelector("section")!;

  expect(section.id).toBe("how");
  expect(section.style.height).toBe("410svh");
  expect(
    screen.getByRole("heading", { level: 2, name: "어떻게 정리하나요" }),
  ).toBeDefined();
  expect(screen.getByText("기사 87건이")).toBeDefined();
  const cards = [...document.querySelectorAll("[data-card]")];
  expect(cards.map((card) => card.textContent)).toEqual(
    SAMPLE_EVENT_ARTICLES.map((article) =>
      expect.stringContaining(article.title),
    ),
  );
  expect(document.querySelector("[data-event-card]")).toBeNull();
  expect(screen.queryByRole("tablist")).toBeNull();
});

test("단계 번호를 누르면 그 단계가 한창인 자리로 부드럽게 내린다", () => {
  holdFrames();
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(900);
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const { container } = render(<HowSection />);
  const section = container.querySelector("section")!;
  Object.defineProperty(section, "offsetHeight", { value: 3690 });
  section.getBoundingClientRect = () => ({ top: 4000 }) as DOMRect;

  const steps = screen.getByRole("list", { name: "정리 단계" });
  fireEvent.click(
    within(steps).getByRole("button", { name: "2단계 사건 연결로 이동" }),
  );

  expect(scrollTo).toHaveBeenCalledWith({
    top: 4000 + 0.6 * (3690 - 900),
    behavior: "smooth",
  });
});

test("동작 줄이기를 켜면 화면에 붙이지 않고 마지막 장면 — 3단계 문장과 미리보기", () => {
  stubReducedMotion();
  const { container } = render(<HowSection />);

  expect(container.querySelector("section")!.style.height).toBe("");
  expect(screen.getByText(/기사 하나도/)).toBeDefined();
  const tabs = screen.getByRole("tablist", { name: "보기 방식" });
  expect(
    within(tabs)
      .getAllByRole("tab")
      .map((tab) => tab.textContent),
  ).toEqual(["흐름지도", "마인드맵"]);
  expect(document.body.textContent).not.toMatch(/UPDATE/);
});
