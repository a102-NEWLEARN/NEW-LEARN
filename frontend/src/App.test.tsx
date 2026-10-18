import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { App } from "./App";

vi.mock("./api/client", () => ({
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
