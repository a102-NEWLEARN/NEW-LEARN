import { fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { Header } from "@/components/shell/Header";
import { renderWithProviders } from "@/test/render";

const noop = () => {};

test("나의 뉴스함은 /bookmarks 로 간다", () => {
  renderWithProviders(<Header onLogoClick={noop} />);

  expect(
    screen.getByRole("link", { name: "나의 뉴스함" }).getAttribute("href"),
  ).toBe("/bookmarks");
});

// 마이페이지는 링크가 아니라 프로필 메뉴(마이페이지 · 로그아웃)를 여는 버튼이다 — 메뉴는 ProfileMenu.test
test("마이페이지는 프로필 메뉴를 여는 버튼이다", () => {
  renderWithProviders(<Header onLogoClick={noop} />);

  const trigger = screen.getByRole("button", { name: "마이페이지" });
  expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
  expect(screen.queryByRole("link", { name: "마이페이지" })).toBeNull();
});

// 사이드바가 서랍이 되는 폭과 같은 판정(셸의 useMediaQuery)으로 글자를 숨긴다. 이름은 스크린 리더에 남는다
test("좁은 화면에서는 메뉴 버튼을 두고 오른쪽 버튼 글자를 숨긴다", () => {
  renderWithProviders(<Header narrow onLogoClick={noop} onMenuClick={noop} />);

  expect(screen.getByRole("button", { name: "메뉴 열기" })).toBeDefined();
  expect(screen.getByText("나의 뉴스함").classList.contains("sr-only")).toBe(
    true,
  );
  // 메뉴 안 *마이페이지* 항목도 DOM 에 있어서 버튼 안 글자만 본다
  const myPageLabel = within(
    screen.getByRole("button", { name: "마이페이지" }),
  ).getByText("마이페이지");
  expect(myPageLabel.classList.contains("sr-only")).toBe(true);
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

// 지금 화면의 버튼을 눌린 모양으로 알린다 — 모바일 v1 · v21 TopNav (Jira 163).
// 마이페이지 버튼은 메뉴를 여는 버튼이라 aria-current 대신 모양만(data-current) 칠한다. 화면 읽기는 메뉴 안 항목이 알린다
const bookmarks = () => screen.getByRole("link", { name: "나의 뉴스함" });
const myPage = () => screen.getByRole("button", { name: "마이페이지" });

test("/bookmarks 에서는 나의 뉴스함만 지금 화면이다", () => {
  renderWithProviders(<Header narrow onLogoClick={noop} />, {
    route: "/bookmarks",
  });

  expect(bookmarks().getAttribute("aria-current")).toBe("page");
  expect(myPage().dataset.current).toBeUndefined();
});

test("/me 에서는 마이페이지 버튼만 지금 화면 모양이다", () => {
  renderWithProviders(<Header narrow onLogoClick={noop} />, { route: "/me" });

  expect(myPage().dataset.current).toBe("true");
  expect(bookmarks().getAttribute("aria-current")).toBeNull();
});

test("홈에서는 어느 버튼도 지금 화면이 아니다", () => {
  renderWithProviders(<Header onLogoClick={noop} />, { route: "/home" });

  expect(bookmarks().getAttribute("aria-current")).toBeNull();
  expect(myPage().dataset.current).toBeUndefined();
});
