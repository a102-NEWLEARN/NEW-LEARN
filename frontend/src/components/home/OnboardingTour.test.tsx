import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  ONBOARDING_KEY,
  OnboardingTour,
  startOnboarding,
} from "@/components/home/OnboardingTour";

// 처음 가입한 사람 가이드 — 홈에서 검색 → 추천 이슈 → 최신 기사 → 용어사전 드래그 차례로 비춘다
// (2026-11-13 사용자 QA 1, Jira 204)

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

// 비출 대상 — 홈이 data-tour 를 붙인다. jsdom 은 크기를 못 재서 자리를 정해 준다
function Targets({ latest = true }: { latest?: boolean }) {
  return (
    <>
      <div data-tour="search">검색</div>
      <div data-tour="issues">추천 이슈</div>
      {latest && <div data-tour="articles">최신 기사</div>}
    </>
  );
}

function stubBoxes() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      return this.hasAttribute("data-tour")
        ? ({
            top: 100,
            bottom: 160,
            left: 40,
            right: 640,
            width: 600,
            height: 60,
          } as DOMRect)
        : ({
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            width: 0,
            height: 0,
          } as DOMRect);
    },
  );
}

const dialog = () => screen.queryByRole("dialog", { name: /.+/ });

test("가입하며 남긴 표시가 없으면 아무것도 그리지 않는다", () => {
  render(
    <>
      <Targets />
      <OnboardingTour />
    </>,
  );
  expect(dialog()).toBeNull();
});

test("가입하면 다음 홈에서 1/4 검색부터 비추고, 다음으로 넘기다 마지막 *시작하기* 로 닫으면 다시 뜨지 않는다", () => {
  stubBoxes();
  startOnboarding();
  const { unmount } = render(
    <>
      <Targets />
      <OnboardingTour />
    </>,
  );

  expect(dialog()?.getAttribute("aria-modal")).toBe("true");
  expect(screen.getByText("1 / 4")).toBeDefined();
  expect(
    screen.getByRole("heading", { name: "무엇이든 검색해요" }),
  ).toBeDefined();
  // 대상 자리를 비춘다 — 가운데가 아니다
  expect(dialog()?.hasAttribute("data-centered")).toBe(false);
  expect(document.activeElement?.textContent).toBe("다음");

  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(screen.getByText("2 / 4")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(screen.getByText("3 / 4")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(screen.getByText("4 / 4")).toBeDefined();
  expect(
    screen.getByRole("heading", { name: "모르는 단어는 드래그해요" }),
  ).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "시작하기" }));

  expect(dialog()).toBeNull();
  expect(localStorage.getItem(ONBOARDING_KEY)).toBe("done");
  unmount();
  render(<OnboardingTour />);
  expect(dialog()).toBeNull();
});

test("*건너뛰기* · Esc 로 바로 닫고 다시 뜨지 않는다", () => {
  startOnboarding();
  const first = render(<OnboardingTour />);
  fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
  expect(dialog()).toBeNull();
  expect(localStorage.getItem(ONBOARDING_KEY)).toBe("done");
  first.unmount();

  startOnboarding();
  render(<OnboardingTour />);
  act(() => {
    fireEvent.keyDown(window, { key: "Escape" });
  });
  expect(dialog()).toBeNull();
});

test("비출 대상이 화면에 없으면(좁은 화면의 다른 보기 탭 등) 말풍선을 가운데에 띄운다", () => {
  stubBoxes();
  startOnboarding();
  render(
    <>
      <Targets latest={false} />
      <OnboardingTour />
    </>,
  );
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));

  expect(screen.getByText("3 / 4")).toBeDefined();
  expect(dialog()?.hasAttribute("data-centered")).toBe(true);
});

test("저장소를 못 쓰면 가이드 없이 그린다", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  startOnboarding();
  render(<OnboardingTour />);
  expect(dialog()).toBeNull();
});
