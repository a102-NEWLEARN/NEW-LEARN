import { fireEvent, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import type { IssueSummary } from "@/api/issues";
import type { Page } from "@/api/types";
import { NewIssues } from "@/components/home/NewIssues";
import { server } from "@/mocks/node";
import { renderWithProviders } from "@/test/render";

test("새로 생긴 이슈 3개를 그 순서대로 이슈 화면 링크로 보인다", async () => {
  renderWithProviders(<NewIssues />);

  const list = await screen.findByRole("list", { name: "새로운 이슈" });
  const links = Array.from(list.querySelectorAll("a"));
  expect(links.map((link) => link.textContent)).toEqual([
    "국회 예산안 처리",
    "한빛반도체 미국 공장 건설",
    "중동 휴전 협상",
  ]);
  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    "/issues/21",
    "/issues/12",
    "/issues/41",
  ]);
});

test("새로 생긴 이슈가 없으면 그 줄을 숨긴다", async () => {
  server.use(
    http.get("/api/v1/issues", () =>
      HttpResponse.json({
        items: [],
        page: 0,
        size: 3,
        totalElements: 0,
        totalPages: 0,
      } satisfies Page<IssueSummary>),
    ),
  );
  renderWithProviders(<NewIssues />);

  await screen.findByRole("status", { name: "새로운 이슈 불러오는 중" });
  await expect.poll(() => screen.queryByRole("status")).toBeNull();
  expect(screen.queryByText("새로운 이슈")).toBeNull();
});

test("불러오지 못하면 그 자리에 안내와 다시 시도를 둔다", async () => {
  // 한 번만 실패하고, 다시 시도하면 기본 가짜 응답을 받는다
  server.use(
    http.get("/api/v1/issues", () => HttpResponse.json(null, { status: 400 }), {
      once: true,
    }),
  );
  renderWithProviders(<NewIssues />);

  expect(
    await screen.findByText("새로운 이슈를 불러오지 못했어요"),
  ).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

  expect(
    await screen.findByRole("list", { name: "새로운 이슈" }),
  ).toBeDefined();
});
