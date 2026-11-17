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

// 닫히는 중인 스낵바는 사라지는 모션 동안 DOM 에 aria-hidden 으로 남는다.
// role 로 찾으면 그것을 빼고 지금 보이는 스낵바만 센다
const shownSnackbars = () =>
  screen
    .queryAllByRole("status")
    .filter((snackbar) => snackbar.textContent?.includes(message));

test("곧 제공 항목을 누르면 안내가 뜨고 2.4초 뒤 사라진다", () => {
  renderWithProviders(<ComingSoonButton />);

  fireEvent.click(screen.getByRole("button", { name: "나의 뉴스함" }));
  expect(shownSnackbars()).toHaveLength(1);

  pass(2399);
  expect(shownSnackbars()).toHaveLength(1);

  // 2.4초에 닫히기 시작하고, 사라지는 모션(0.2초) 뒤에 DOM 에서도 빠진다
  pass(1);
  expect(shownSnackbars()).toHaveLength(0);
  pass(200);
  expect(screen.queryByText(message)).toBeNull();
});

test("연달아 누르면 앞 스낵바를 바로 바꾸고 하나만 보인다", () => {
  renderWithProviders(<ComingSoonButton />);
  const button = screen.getByRole("button", { name: "나의 뉴스함" });

  fireEvent.click(button);
  fireEvent.click(button);
  // 앞 것은 바로 닫히기 시작하고 0.2초 뒤 새 것이 뜬다
  expect(shownSnackbars()).toHaveLength(0);
  pass(200);
  expect(shownSnackbars()).toHaveLength(1);

  // 새 것도 2.4초 뒤 닫힌다. 줄 세우면(queued) 이때 아직 보인다
  pass(2400);
  expect(shownSnackbars()).toHaveLength(0);
  pass(200);
  expect(screen.queryByText(message)).toBeNull();
});
