import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CoachMarks, resetCoachMarks } from "@/components/coach/CoachMarks";

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

test("가입하면(resetCoachMarks) 다시 보지 않기로 닫은 안내도 다시 뜬다", async () => {
  const { unmount } = setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "다시 보지 않기" }),
  );
  unmount();
  resetCoachMarks();
  setup();
  expect(await screen.findByRole("dialog")).toBeTruthy();
});

test("알겠어요는 이번만 닫는다", async () => {
  const { unmount } = setup();
  fireEvent.click(await screen.findByRole("button", { name: "알겠어요" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  unmount();
  setup();
  expect(await screen.findByRole("dialog")).toBeTruthy();
});

// 설명 상자 크기 — 재는 상자(fixed · 숨김)는 120×50, 대상은 data-coach 의 자리
const LABEL = { w: 120, h: 50 };
function setupRow(rects: Record<string, [number, number, number, number]>) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const t = this.getAttribute("data-coach");
      if (t && rects[t]) {
        const [left, top, right, bottom] = rects[t];
        return {
          left,
          top,
          right,
          bottom,
          width: right - left,
          height: bottom - top,
        } as DOMRect;
      }
      const measuring =
        this instanceof HTMLElement && this.style.visibility === "hidden";
      return {
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: measuring ? LABEL.w : 0,
        height: measuring ? LABEL.h : 0,
      } as DOMRect;
    },
  );
}

function boxOf(title: string) {
  const el = screen.getByText(title).parentElement!;
  const s = el.style;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = s.left ? parseFloat(s.left) : vw - parseFloat(s.right) - LABEL.w;
  const top = s.top ? parseFloat(s.top) : vh - parseFloat(s.bottom) - LABEL.h;
  return { left, top, right: left + LABEL.w, bottom: top + LABEL.h };
}

const overlap = (a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

test("나란한 대상의 설명은 서로 겹치지 않는다", async () => {
  // 오른쪽 끝에 붙은 두 버튼 — 둘 다 아래 · 왼쪽으로 펼치면 같은 자리에 겹친다
  const vw = window.innerWidth;
  setupRow({
    a: [vw - 120, 100, vw - 80, 140],
    b: [vw - 70, 100, vw - 30, 140],
  });
  render(
    <>
      <div data-coach="a" />
      <div data-coach="b" />
      <CoachMarks
        id="row"
        marks={[
          { target: "a", title: "가", body: "가 설명", side: "bottom" },
          { target: "b", title: "나", body: "나 설명", side: "bottom" },
        ]}
        delay={0}
      />
    </>,
  );
  await screen.findByText("가");
  expect(overlap(boxOf("가"), boxOf("나"))).toBe(false);
});

test("설명은 다른 대상을 덮지 않는다", async () => {
  // b 바로 아래에 a(넓은 줄)가 있다 — b 의 설명을 아래에 두면 a 를 덮는다
  setupRow({ a: [20, 300, 700, 360], b: [400, 200, 440, 240] });
  render(
    <>
      <div data-coach="a" />
      <div data-coach="b" />
      <CoachMarks
        id="hole"
        marks={[
          { target: "a", title: "가", body: "가 설명" },
          { target: "b", title: "나", body: "나 설명", side: "bottom" },
        ]}
        delay={0}
      />
    </>,
  );
  await screen.findByText("나");
  expect(
    overlap(boxOf("나"), { left: 14, top: 294, right: 706, bottom: 366 }),
  ).toBe(false);
});

test("안내가 떠 있는 동안 화면이 스크롤되지 않고, 닫으면 돌아온다", async () => {
  setup();
  const dialog = await screen.findByRole("dialog");
  // 스크롤 막기는 안내를 그린 뒤 효과(useEffect)에서 건다 — 막이 보인 직후에는 아직일 수 있어 기다린다.
  // 바로 보면 시험이 몰려 느릴 때 가끔 빈 값을 읽었다
  await waitFor(() =>
    expect(document.documentElement.style.overflow).toBe("hidden"),
  );
  const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true });
  dialog.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "알겠어요" }));
  expect(document.documentElement.style.overflow).toBe("");
});
