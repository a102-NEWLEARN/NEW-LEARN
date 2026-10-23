import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useComingSoon } from "@/components/useSnackbar";
import { renderWithProviders } from "@/test/render";

const message = "MVP 이후 제공 예정인 기능이에요";

// 헤더의 나의 뉴스함처럼 곧 제공 항목 하나를 둔다
function ComingSoonButton() {
  const comingSoon = useComingSoon();

  return (
    <button type="button" onClick={comingSoon}>
      나의 뉴스함
    </button>
  );
}

// 스낵바는 setTimeout 으로 사라진다. 시간을 건너뛰고, 타이머가 다음 타이머를 거는 단계마다 화면을 반영한다
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const pass = (ms: number) => act(() => vi.advanceTimersByTime(ms));

test("곧 제공 항목을 누르면 안내가 뜨고 2.4초 뒤 사라진다", () => {
  renderWithProviders(<ComingSoonButton />);

  fireEvent.click(screen.getByRole("button", { name: "나의 뉴스함" }));
  expect(screen.getByText(message)).toBeDefined();

  pass(2399);
  expect(screen.getByText(message)).toBeDefined();

  // 2.4초에 닫히기 시작하고, 사라지는 모션(0.2초) 뒤에 화면에서 빠진다
  pass(1);
  pass(200);
  expect(screen.queryByText(message)).toBeNull();
});

test("연달아 누르면 앞 스낵바를 바로 바꾸고 하나만 보인다", () => {
  renderWithProviders(<ComingSoonButton />);
  const button = screen.getByRole("button", { name: "나의 뉴스함" });

  fireEvent.click(button);
  fireEvent.click(button);
  expect(screen.getAllByText(message)).toHaveLength(1);

  // 앞 것이 0.2초 만에 빠지고 새 것이 2.4초 뜬다. 줄 세우면(queued) 이때도 남아 있다
  pass(200);
  expect(screen.getAllByText(message)).toHaveLength(1);
  pass(2400);
  pass(200);
  expect(screen.queryByText(message)).toBeNull();
});
