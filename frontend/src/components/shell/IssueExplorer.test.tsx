import { fireEvent, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import { IssueExplorer } from "@/components/shell/IssueExplorer";
import { server } from "@/mocks/node";
import { renderWithProviders } from "@/test/render";

const category = (name: string) => screen.findByRole("button", { name });

test("A1 분야 뒤에 준비 중인 분야 두 개를 붙인다", async () => {
  renderWithProviders(<IssueExplorer />);

  await category("정치");
  const names = screen
    .getAllByRole("button")
    .map((button) => button.textContent);
  expect(names).toEqual([
    "정치",
    "사회",
    "경제",
    "국제",
    "IT·과학",
    "스포츠준비 중",
    "문화/연예준비 중",
  ]);
});

test("분야를 누르면 그 분야 이슈를 연도별로 보여 준다", async () => {
  renderWithProviders(<IssueExplorer />);

  const economy = await category("경제");
  expect(economy.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(economy);
  expect(economy.getAttribute("aria-expanded")).toBe("true");

  const list = await screen.findByRole("list", { name: "경제 이슈" });
  const years = within(list)
    .getAllByRole("heading")
    .map((heading) => heading.textContent);
  expect(years).toEqual(["2026", "2025"]);
  expect(
    within(list)
      .getByRole("link", { name: "한빛반도체 미국 공장 건설" })
      .getAttribute("href"),
  ).toBe("/issues/12");
});

test("한 번에 한 분야만 열린다", async () => {
  renderWithProviders(<IssueExplorer />);

  fireEvent.click(await category("경제"));
  fireEvent.click(await category("정치"));

  expect((await category("경제")).getAttribute("aria-expanded")).toBe("false");
  expect((await category("정치")).getAttribute("aria-expanded")).toBe("true");
});

test("준비 중인 분야를 누르면 안내한다", async () => {
  renderWithProviders(<IssueExplorer />);

  fireEvent.click(await screen.findByRole("button", { name: /스포츠/ }));

  expect(await screen.findByText("스포츠는 준비 중이에요")).toBeDefined();
});

test("지금 보는 이슈를 표시한다", async () => {
  renderWithProviders(<IssueExplorer />, { route: "/issues/12" });

  fireEvent.click(await category("경제"));

  const current = await screen.findByRole("link", {
    name: "한빛반도체 미국 공장 건설",
  });
  expect(current.getAttribute("aria-current")).toBe("page");
});

test("이슈가 없는 분야는 빈 문구를 보여 준다", async () => {
  server.use(
    http.get("/api/v1/issues", () =>
      HttpResponse.json({
        items: [],
        page: 0,
        size: 50,
        totalElements: 0,
        totalPages: 0,
      }),
    ),
  );
  renderWithProviders(<IssueExplorer />);

  fireEvent.click(await category("국제"));

  expect(await screen.findByText("이 분야의 이슈가 아직 없어요")).toBeDefined();
});

test("이슈를 못 불러오면 그 자리에 다시 시도를 둔다", async () => {
  server.use(
    http.get("/api/v1/issues", () =>
      HttpResponse.json(
        { status: 500, code: "INTERNAL_ERROR" },
        { status: 500 },
      ),
    ),
  );
  renderWithProviders(<IssueExplorer />);

  fireEvent.click(await category("사회"));

  expect(await screen.findByText("이슈를 불러오지 못했어요")).toBeDefined();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeDefined();
});
