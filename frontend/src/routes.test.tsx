import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import { server } from "@/mocks/node";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { renderRoute, renderWithProviders } from "@/test/render";

// 앱과 같은 provider · 라우트 목록으로 연다. provider 를 빼먹으면 첫 화면이 깨지는 것을 여기서 잡는다
test("/ 를 열면 개발 확인 화면을 보여 준다", async () => {
  // 헬스는 화면용 API 가 아니라 가짜 API 핸들러에 없다 (App.test.tsx 와 같다)
  server.use(
    http.get("/actuator/health", () => HttpResponse.json({ status: "UP" })),
  );
  renderRoute("/");

  const header = await screen.findByRole("banner");
  expect(within(header).getByRole("img", { name: "NEW:LEARN" })).toBeDefined();
  expect(
    await screen.findByText("카테고리: 정치 · 사회 · 경제 · 국제 · IT·과학"),
  ).toBeDefined();
});

test("없는 주소를 열면 찾을 수 없음 화면과 홈으로 가는 링크를 보여 준다", async () => {
  renderRoute("/nope");

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
