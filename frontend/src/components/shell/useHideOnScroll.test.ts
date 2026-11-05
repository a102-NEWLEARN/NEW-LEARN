import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { useHideOnScroll } from "@/components/shell/useHideOnScroll";

// jsdom 은 배치를 계산하지 않는다 — 보이는 높이 800, 내용 높이 3000 인 스크롤 칸인 척한다
function setup(enabled = true) {
  const box = document.createElement("div");
  Object.defineProperty(box, "clientHeight", {
    configurable: true,
    value: 800,
  });
  Object.defineProperty(box, "scrollHeight", {
    configurable: true,
    value: 3000,
  });
  const ref = { current: box };
  const hook = renderHook(
    ({ on }: { on: boolean }) => useHideOnScroll(ref, on),
    { initialProps: { on: enabled } },
  );
  const scrollTo = (top: number) =>
    act(() => {
      box.scrollTop = top;
      box.dispatchEvent(new Event("scroll"));
    });
  return { hook, scrollTo };
}

test("아래로 내려 읽으면 숨고, 위로 올리면 다시 나온다", () => {
  const { hook, scrollTo } = setup();
  expect(hook.result.current).toBe(false);

  scrollTo(300);
  expect(hook.result.current).toBe(true);

  scrollTo(260);
  expect(hook.result.current).toBe(false);
});

test("맨 위 가까이에서는 내려도 보이고, 맨 끝에 닿으면 다시 나온다", () => {
  const { hook, scrollTo } = setup();

  scrollTo(40);
  expect(hook.result.current).toBe(false);

  scrollTo(1200);
  expect(hook.result.current).toBe(true);

  // 1200 + 800 < 3000 — 아직 끝이 아니다
  scrollTo(1900);
  expect(hook.result.current).toBe(true);

  // 2200 + 800 = 3000 — 끝. 스크롤 끝 96px 여백이 있어 마지막 내용을 덮지 않는다
  scrollTo(2200);
  expect(hook.result.current).toBe(false);
});

test("조금 흔들린 것(4px 이하)으로는 바뀌지 않는다", () => {
  const { hook, scrollTo } = setup();
  scrollTo(500);
  expect(hook.result.current).toBe(true);

  scrollTo(497);
  expect(hook.result.current).toBe(true);
});

test("끄면 늘 보이고, 숨은 채 끄면 바로 나온다", () => {
  const { hook, scrollTo } = setup(false);
  scrollTo(500);
  expect(hook.result.current).toBe(false);

  hook.rerender({ on: true });
  scrollTo(900);
  expect(hook.result.current).toBe(true);

  hook.rerender({ on: false });
  expect(hook.result.current).toBe(false);
});
