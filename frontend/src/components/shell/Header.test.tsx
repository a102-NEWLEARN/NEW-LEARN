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

test("로고를 누르면 셸에 알린다 (본문을 맨 위로 올리게)", () => {
  let clicked = 0;
  renderWithProviders(<Header onLogoClick={() => clicked++} />);

  fireEvent.click(screen.getByRole("link", { name: "NEW:LEARN 홈으로" }));

  expect(clicked).toBe(1);
});
