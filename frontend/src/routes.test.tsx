import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test } from "vitest";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { routes } from "@/routes";
import { renderWithProviders } from "@/test/render";

// 앱과 같은 라우트 목록으로 주소를 연다. renderWithProviders 는 라우터를 이미 감싸서 여기서는 쓰지 않는다
test("없는 주소를 열면 찾을 수 없음 화면과 홈으로 가는 링크를 보여 준다", async () => {
  const router = createMemoryRouter(routes, { initialEntries: ["/nope"] });
  render(<RouterProvider router={router} />);

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "페이지를 찾을 수 없어요",
    }),
  ).toBeDefined();
  expect(
    screen.getByRole("link", { name: "홈으로" }).getAttribute("href"),
  ).toBe("/home");
});

test("화면이 넘긴 제목을 보여 준다", () => {
  renderWithProviders(<NotFoundPage title="이슈를 찾을 수 없어요" />);

  expect(
    screen.getByRole("heading", { level: 1, name: "이슈를 찾을 수 없어요" }),
  ).toBeDefined();
});
