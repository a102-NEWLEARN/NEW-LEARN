import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { GreetingIntro } from "./GreetingIntro";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function renderIntro() {
  const onLift = vi.fn();
  const onDone = vi.fn();
  const view = render(
    <GreetingIntro
      eyebrow="NEW:LEARN"
      title="안녕하세요!"
      onLift={onLift}
      onDone={onDone}
    />,
  );
  const curtain = view.container.firstElementChild as HTMLElement;
  return { onLift, onDone, curtain, ...view };
}

test("인사가 1.8초 머문 뒤 막을 걷기 시작하고, 0.6초 뒤 끝났다고 알린다", () => {
  const { onLift, onDone } = renderIntro();
  expect(screen.getByText("안녕하세요!")).toBeDefined();

  act(() => vi.advanceTimersByTime(1799));
  expect(onLift).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(onLift).toHaveBeenCalledTimes(1);
  expect(onDone).not.toHaveBeenCalled();

  act(() => vi.advanceTimersByTime(600));
  expect(onDone).toHaveBeenCalledTimes(1);
});

test("아무 키나 치면 바로 막을 걷는다", () => {
  const { onLift, onDone } = renderIntro();

  fireEvent.keyDown(window, { key: "Enter" });
  expect(onLift).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(600));
  expect(onDone).toHaveBeenCalledTimes(1);
});

test("막을 누르면 바로 걷는다", () => {
  const { onLift, curtain } = renderIntro();

  fireEvent.pointerDown(curtain);
  expect(onLift).toHaveBeenCalledTimes(1);
});

test("장식이라 화면 읽기에서 뺀다", () => {
  const { curtain } = renderIntro();

  expect(curtain.getAttribute("aria-hidden")).toBe("true");
});

test("부모가 새 함수로 다시 그려도 타이머를 처음부터 다시 걸지 않는다", () => {
  const { rerender } = renderIntro();
  act(() => vi.advanceTimersByTime(1000));

  const onLift = vi.fn();
  rerender(
    <GreetingIntro
      eyebrow="NEW:LEARN"
      title="안녕하세요!"
      onLift={onLift}
      onDone={() => {}}
    />,
  );
  act(() => vi.advanceTimersByTime(800));
  expect(onLift).toHaveBeenCalledTimes(1);
});
