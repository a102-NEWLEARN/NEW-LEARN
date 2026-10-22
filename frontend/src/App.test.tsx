import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { App } from "@/App";

vi.mock("@/api/client", () => ({
  api: { get: vi.fn().mockResolvedValue({ data: { status: "UP" } }) },
}));

test("API 헬스 응답을 화면에 보여 준다", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );

  expect(screen.getByRole("heading", { name: "NEW:LEARN" })).toBeDefined();
  expect(await screen.findByText("API 상태: UP")).toBeDefined();
});

test("헤더에 NEW:LEARN 로고를 보여 준다", () => {
  // 테스트 사이에 화면이 자동으로 지워지지 않아(Vitest globals 꺼짐) 이 테스트가 그린 화면 안에서만 찾는다
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );

  const header = within(container).getByRole("banner");
  expect(within(header).getByRole("img", { name: "NEW:LEARN" })).toBeDefined();
});
