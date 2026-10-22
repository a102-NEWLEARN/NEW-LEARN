import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { beforeEach, expect, test } from "vitest";
import { App } from "@/App";
import { server } from "@/mocks/node";
import { renderWithProviders } from "@/test/render";

// 헬스는 화면용 API 가 아니라 가짜 API 핸들러에 없다. 이 테스트에서만 둔다
beforeEach(() => {
  server.use(
    http.get("/actuator/health", () => HttpResponse.json({ status: "UP" })),
  );
});

test("API 헬스 응답을 화면에 보여 준다", async () => {
  renderWithProviders(<App />);

  expect(screen.getByRole("heading", { name: "NEW:LEARN" })).toBeDefined();
  expect(await screen.findByText("API 상태: UP")).toBeDefined();
});

test("가짜 API 에서 받은 A1 카테고리를 보여 준다", async () => {
  renderWithProviders(<App />);

  expect(
    await screen.findByText("카테고리: 정치 · 사회 · 경제 · 국제 · IT·과학"),
  ).toBeDefined();
});

test("다시 확인 버튼에 아이콘을 붙인다", async () => {
  renderWithProviders(<App />);

  // 처음에는 헬스를 부르는 중이라 버튼이 로딩 상태다. 응답을 받은 뒤에 찾는다
  const button = await screen.findByRole("button", { name: "다시 확인" });
  expect(button.querySelector("svg")).not.toBeNull();
});

test("헤더에 NEW:LEARN 로고를 보여 준다", () => {
  renderWithProviders(<App />);

  const header = screen.getByRole("banner");
  expect(within(header).getByRole("img", { name: "NEW:LEARN" })).toBeDefined();
});
