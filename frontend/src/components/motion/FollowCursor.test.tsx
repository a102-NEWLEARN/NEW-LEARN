import { act, render } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { FollowCursor } from "./FollowCursor";

const FINE_POINTER = "(hover: hover) and (pointer: fine)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// 이 미디어 쿼리들만 맞는 것으로 둔다. 테스트가 끝나면 setup 이 넓은 화면으로 되돌린다 (src/test/setup.ts)
function stubMedia(matching: string[]) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: matching.includes(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

// jsdom 에 PointerEvent 가 없어도 되게 MouseEvent 에 pointerType 을 붙인다
function pointer(
  type: string,
  target: EventTarget,
  init: { pointerType?: string; x?: number; y?: number } = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: init.x ?? 0,
    clientY: init.y ?? 0,
  });
  act(() => {
    target.dispatchEvent(
      Object.assign(event, { pointerType: init.pointerType ?? "mouse" }),
    );
  });
}

function renderCursor() {
  const view = render(
    <>
      <button type="button">누르기</button>
      <FollowCursor />
    </>,
  );
  const ring = view.container.querySelector<HTMLElement>("[aria-hidden]");
  return { ring, button: view.getByRole("button") };
}

test("마우스를 쓰면 원을 두고, 마우스가 움직이면 보인다", () => {
  stubMedia([FINE_POINTER]);
  const { ring } = renderCursor();

  expect(ring).not.toBeNull();
  expect(ring!.hasAttribute("data-shown")).toBe(false);
  pointer("pointermove", window, { x: 100, y: 200 });
  expect(ring!.hasAttribute("data-shown")).toBe(true);
});

test("누를 수 있는 것 위에서는 커지고, 벗어나면 돌아온다", () => {
  stubMedia([FINE_POINTER]);
  const { ring, button } = renderCursor();

  pointer("pointermove", button);
  expect(ring!.hasAttribute("data-pressable")).toBe(true);
  pointer("pointermove", document.body);
  expect(ring!.hasAttribute("data-pressable")).toBe(false);
});

test("터치 · 펜 움직임은 따라가지 않는다", () => {
  stubMedia([FINE_POINTER]);
  const { ring } = renderCursor();

  pointer("pointermove", window, { pointerType: "touch" });
  pointer("pointermove", window, { pointerType: "pen" });
  expect(ring!.hasAttribute("data-shown")).toBe(false);
});

test("마우스가 창 밖으로 나가면 숨긴다", () => {
  stubMedia([FINE_POINTER]);
  const { ring } = renderCursor();

  pointer("pointermove", window);
  pointer("pointerleave", document.documentElement);
  expect(ring!.hasAttribute("data-shown")).toBe(false);
});

test("마우스가 없는 화면에서는 원을 두지 않는다", () => {
  stubMedia([]);
  const { ring } = renderCursor();

  expect(ring).toBeNull();
});

test("동작 줄이기를 켜면 원을 두지 않는다", () => {
  stubMedia([FINE_POINTER, REDUCED_MOTION]);
  const { ring } = renderCursor();

  expect(ring).toBeNull();
});
