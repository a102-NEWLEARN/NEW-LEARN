import { act, fireEvent, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { beforeEach, expect, test, vi } from "vitest";
import { MeaningBubble } from "@/components/meaning/MeaningBubble";
import { meaningProps } from "@/components/meaning/meaningProps";
import { server } from "@/mocks/node";
import { renderWithProviders } from "@/test/render";

// F13 용어사전 말풍선 — 드래그(선택) → 「의미」 → 점 셋 → 뜻 (docs/api-screen.md A26).
// jsdom 은 선택 영역의 화면 위치를 재지 못해 Range 의 상자를 정해 둔다
beforeEach(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect(200, 300, 40, 18);
});

const LEAF = "가계의 이자를 줄이려고, 기준금리를 낮췄다";

function renderPage() {
  return renderWithProviders(
    <>
      <p data-testid="leaf" {...meaningProps("ARTICLE", 409)}>
        {LEAF}
      </p>
      <p data-testid="plain">드래그 대상이 아닌 글 이자</p>
      <MeaningBubble />
    </>,
  );
}

// 드래그를 흉내 낸다 — 글에서 고르고 마우스를 뗀다
function drag(testId: string, selected: string) {
  const node = screen.getByTestId(testId).firstChild!;
  const at = node.textContent!.indexOf(selected);
  const range = document.createRange();
  range.setStart(node, at);
  range.setEnd(node, at + selected.length);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent.pointerUp(document.body);
  act(() => vi.runOnlyPendingTimers());
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  return () => vi.useRealTimers();
});

const meaningButton = () => screen.findByRole("button", { name: /^의미/ });

test("드래그하면 「의미」 하나가 뜨고, 누르면 점 셋이 튀다가 뜻이 사전처럼 뜬다", async () => {
  renderPage();
  drag("leaf", "이자를");

  fireEvent.click(await meaningButton());

  expect(screen.getByText("'이자를'의 뜻을 찾는 중")).toBeDefined();
  expect(document.querySelectorAll("[data-meaning-dot]")).toHaveLength(3);
  const card = await screen.findByRole("region", { name: "'이자를'의 뜻" });
  expect(card.textContent).toContain("이자");
  expect(card.textContent).toContain("명사");
  expect(card.textContent).toContain(
    "남에게 돈을 빌려 쓴 대가로 치르는 일정 비율의 돈.",
  );
  expect(card.textContent).toContain("AI 생성");
});

test("고른 말 · 앞뒤 조각 · 대상을 A26 에 보낸다", async () => {
  let sent: unknown;
  server.use(
    http.post("/api/v1/dictionary/meaning", async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json({
        query: "기준금리",
        word: "기준금리",
        pos: "명사",
        definition: "정책 금리.",
      });
    }),
  );
  renderPage();
  drag("leaf", "기준금리");
  fireEvent.click(await meaningButton());

  await screen.findByText("정책 금리.");
  expect(sent).toEqual({
    term: "기준금리",
    around: LEAF,
    contextType: "ARTICLE",
    contextId: 409,
  });
});

test.each([
  ["문장부호만", "leaf", ","],
  ["앞 글자에 붙은 한 글자", "leaf", "를"],
  ["드래그 대상이 아닌 글", "plain", "이자"],
])("%s 에는 말풍선이 뜨지 않는다", async (_, testId, selected) => {
  renderPage();
  drag(testId, selected);
  await act(() => vi.advanceTimersByTimeAsync(400));
  expect(screen.queryByRole("button", { name: /^의미/ })).toBeNull();
});

test("풀이할 수 없는 말이면 낱말 전체를 고르라고 알린다", async () => {
  renderPage();
  drag("leaf", "려고");
  fireEvent.click(await meaningButton());

  expect(
    await screen.findByText("뜻을 풀이하기 어려워요. 낱말 전체를 골라 보세요."),
  ).toBeDefined();
});

test.each([
  [502, { code: "DICTIONARY_UNAVAILABLE" }, "지금은 찾을 수 없어요"],
  [429, {}, "요청이 많아요. 잠시 뒤 다시 시도해 주세요"],
])("%s 이면 말풍선 안에 실패를 알린다", async (status, body, message) => {
  server.use(
    http.post("/api/v1/dictionary/meaning", () =>
      HttpResponse.json(
        { title: "실패", status, ...body },
        { status, headers: { "Content-Type": "application/problem+json" } },
      ),
    ),
  );
  renderPage();
  drag("leaf", "이자를");
  fireEvent.click(await meaningButton());

  expect(await screen.findByText(message)).toBeDefined();
});

test("Esc · 바깥 누르기로 닫는다 — Esc 는 다른 것보다 먼저 받는다", async () => {
  renderPage();
  drag("leaf", "이자를");
  await meaningButton();

  const escape = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    document.body.dispatchEvent(escape);
  });
  expect(escape.defaultPrevented).toBe(true);
  expect(screen.queryByRole("button", { name: /^의미/ })).toBeNull();

  drag("leaf", "기준금리");
  await meaningButton();
  fireEvent.pointerDown(screen.getByTestId("plain"));
  expect(screen.queryByRole("button", { name: /^의미/ })).toBeNull();
  expect(window.getSelection()?.isCollapsed).toBe(true);
});

test("기다리는 중 다른 말을 고르면 앞 답은 버린다", async () => {
  let release: () => void = () => {};
  server.use(
    http.post(
      "/api/v1/dictionary/meaning",
      () =>
        new Promise<Response>((resolve) => {
          release = () =>
            resolve(
              HttpResponse.json({
                query: "이자를",
                word: "이자",
                pos: "명사",
                definition: "늦게 온 답.",
              }),
            );
        }),
    ),
  );
  renderPage();
  drag("leaf", "이자를");
  fireEvent.click(await meaningButton());

  drag("leaf", "기준금리");
  await meaningButton();
  // 앞 답이 axios · react-query 를 거쳐 실제로 도착할 때까지 흘려보낸 뒤에 본다
  await act(async () => {
    release();
    await vi.advanceTimersByTimeAsync(200);
  });

  expect(screen.queryByText("늦게 온 답.")).toBeNull();
  expect(screen.getByRole("button", { name: /^의미/ })).toBeDefined();
});

test("우클릭은 말풍선 · 선택을 그대로 둔다 — 메뉴에서 「복사」를 고를 수 있게", async () => {
  renderPage();
  drag("leaf", "이자를");
  await meaningButton();

  fireEvent.pointerDown(screen.getByTestId("leaf"), { button: 2 });

  expect(screen.getByRole("button", { name: /^의미/ })).toBeDefined();
  expect(window.getSelection()?.toString()).toBe("이자를");
});

test("말풍선 없이 남은 선택도 다음 누르기에 지운다 — select-none 인 지도에서 클릭이 막히지 않게", async () => {
  renderPage();
  drag("leaf", "를");
  await act(() => vi.advanceTimersByTimeAsync(400));
  expect(screen.queryByRole("button", { name: /^의미/ })).toBeNull();
  expect(window.getSelection()?.isCollapsed).toBe(false);

  fireEvent.pointerDown(screen.getByTestId("plain"), { button: 0 });

  expect(window.getSelection()?.isCollapsed).toBe(true);
});
