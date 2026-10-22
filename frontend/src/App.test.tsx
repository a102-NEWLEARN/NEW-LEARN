import { screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { App } from "@/App";
import { renderWithProviders } from "@/test/render";

vi.mock("@/api/client", () => ({
  api: { get: vi.fn().mockResolvedValue({ data: { status: "UP" } }) },
}));

test("API 헬스 응답을 화면에 보여 준다", async () => {
  renderWithProviders(<App />);

  expect(screen.getByRole("heading", { name: "NEW:LEARN" })).toBeDefined();
  expect(await screen.findByText("API 상태: UP")).toBeDefined();
});

test("헤더에 NEW:LEARN 로고를 보여 준다", () => {
  renderWithProviders(<App />);

  const header = screen.getByRole("banner");
  expect(within(header).getByRole("img", { name: "NEW:LEARN" })).toBeDefined();
});
