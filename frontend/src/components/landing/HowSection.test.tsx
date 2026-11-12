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
  // 화면 읽기는 진행도와 상관없이 네 단계 문장을 다 읽는다 — 화면 문장은 스크롤로 바뀌어 늘 뺀다
  const story = within(screen.getByRole("list", { name: "정리하는 차례" }));
  expect(
    story.getAllByRole("listitem").map((item) => item.textContent),
  ).toEqual([
    expect.stringContaining("기사 87건이"),
    expect.stringContaining("사건 하나로 묶이고"),
    expect.stringContaining("이슈의 흐름 위에 놓여요"),
    expect.stringContaining("기사 하나도 한눈에 펼쳐요"),
  ]);
  expect(
    screen.getByText("기사 87건이").closest("[aria-hidden]"),
  ).not.toBeNull();
  const cards = [...document.querySelectorAll("[data-card]")];
  expect(cards.map((card) => card.textContent)).toEqual(
    SAMPLE_EVENT_ARTICLES.map((article) =>
      expect.stringContaining(article.title),
    ),
  );
  expect(document.querySelector("[data-event-card]")).toBeNull();
  expect(screen.queryByRole("group", { name: "보기 방식" })).toBeNull();
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

test("동작 줄이기를 켜면 화면에 붙이지 않고 마지막 장면 — 3단계와 마인드맵 미리보기, 보기 버튼은 미리보기를 바로 바꾼다", () => {
  stubReducedMotion();
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const { container } = render(<HowSection />);

  expect(container.querySelector("section")!.style.height).toBe("");
  expect(
    within(screen.getByRole("list", { name: "정리 단계" })).getByText(
      "흐름지도·마인드맵",
    ),
  ).toBeDefined();
  // 옮길 장면이 없어 단계 번호는 누르는 버튼이 아니다
  expect(screen.queryByRole("button", { name: /단계 .* 이동/ })).toBeNull();
  const views = within(screen.getByRole("group", { name: "보기 방식" }));
  expect(
    views
      .getByRole("button", { name: "마인드맵" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(screen.getByText("기사 마인드맵")).toBeDefined();

  fireEvent.click(views.getByRole("button", { name: "흐름지도" }));

  expect(
    views
      .getByRole("button", { name: "흐름지도" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(screen.getByText("기사 흐름지도")).toBeDefined();
  expect(scrollTo).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toMatch(/UPDATE/);
});
