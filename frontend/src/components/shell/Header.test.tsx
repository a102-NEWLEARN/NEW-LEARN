import { fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Header } from "@/components/shell/Header";
import { renderWithProviders } from "@/test/render";

const noop = () => {};

test("나의 뉴스함은 곧 제공 안내를 띄운다", async () => {
  renderWithProviders(<Header onLogoClick={noop} />);

  fireEvent.click(screen.getByRole("button", { name: "나의 뉴스함" }));

  expect(
    await screen.findByText("MVP 이후 제공 예정인 기능이에요"),
  ).toBeDefined();
});

test("마이페이지는 /me 로 간다", () => {
  renderWithProviders(<Header onLogoClick={noop} />);

  expect(
    screen.getByRole("link", { name: "마이페이지" }).getAttribute("href"),
  ).toBe("/me");
});

// 사이드바가 서랍이 되는 폭과 같은 판정(셸의 useMediaQuery)으로 글자를 숨긴다. 이름은 스크린 리더에 남는다
test("좁은 화면에서는 메뉴 버튼을 두고 오른쪽 버튼 글자를 숨긴다", () => {
  renderWithProviders(<Header narrow onLogoClick={noop} onMenuClick={noop} />);

  expect(screen.getByRole("button", { name: "메뉴 열기" })).toBeDefined();
  expect(screen.getByText("나의 뉴스함").classList.contains("sr-only")).toBe(
    true,
  );
  expect(screen.getByText("마이페이지").classList.contains("sr-only")).toBe(
    true,
  );
});

test("넓은 화면에서는 메뉴 버튼이 없고 글자가 보인다", () => {
  renderWithProviders(<Header onLogoClick={noop} onMenuClick={noop} />);

  expect(screen.queryByRole("button", { name: "메뉴 열기" })).toBeNull();
  expect(screen.getByText("나의 뉴스함").classList.contains("sr-only")).toBe(
    false,
  );
});

test("로고를 누르면 셸에 알린다 (본문을 맨 위로 올리게)", () => {
  let clicked = 0;
  renderWithProviders(<Header onLogoClick={() => clicked++} />);

  fireEvent.click(screen.getByRole("link", { name: "NEW:LEARN 홈으로" }));

  expect(clicked).toBe(1);
});
