import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CoachMarks } from "@/components/coach/CoachMarks";

// 화면 안내(코치마크) — 어두운 막 위에 주요 기능을 한꺼번에 점선으로 가리킨다

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const MARKS = [
  { target: "a", title: "가", body: "가 설명" },
  { target: "b", title: "나", body: "나 설명" },
];

function setup() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const on = this.hasAttribute("data-coach");
      return {
        top: 100,
        bottom: 140,
        left: 40,
        right: 140,
        width: on ? 100 : 0,
        height: on ? 40 : 0,
      } as DOMRect;
    },
  );
  return render(
    <>
      <div data-coach="a" />
      <CoachMarks id="t" marks={MARKS} delay={0} />
    </>,
  );
}

test("화면에 있는 대상만 설명을 띄운다", async () => {
  setup();
  expect(await screen.findByText("가")).toBeTruthy();
  expect(screen.queryByText("나")).toBeNull();
});

test("다시 보지 않기를 누르면 닫히고 다음에도 뜨지 않는다", async () => {
  const { unmount } = setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "다시 보지 않기" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  unmount();
  setup();
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("알겠어요는 이번만 닫는다", async () => {
  const { unmount } = setup();
  fireEvent.click(await screen.findByRole("button", { name: "알겠어요" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  unmount();
  setup();
  expect(await screen.findByRole("dialog")).toBeTruthy();
});
