import { act, fireEvent, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { afterEach, expect, test, vi } from "vitest";
import type { IssueSummary } from "@/api/issues";
import type { Page } from "@/api/types";
import { NewIssues } from "@/components/home/NewIssues";
import { server } from "@/mocks/node";
import { stubReducedMotion } from "@/test/media";
import { expectMotionSafe } from "@/test/motion";
import { renderWithProviders } from "@/test/render";

afterEach(() => vi.useRealTimers());

// 띠는 setInterval 로 돈다. 그것만 가짜로 두고 MSW · React Query 는 그대로
const fakeTicker = () =>
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });

// 지금 보이는 제목 — 세 줄을 한 칸에 겹쳐 두고 하나만 보인다
const current = () =>
  document.querySelector('[data-state="current"]')?.textContent ?? null;

test("새로운 이슈는 한 줄에 하나씩 보이고, 3초마다 다음 이슈가 아래에서 올라온다", async () => {
  fakeTicker();
  renderWithProviders(<NewIssues />);
  await screen.findByRole("list", { name: "새로운 이슈" });

  expect(current()).toBe("국회 예산안 처리");
  act(() => vi.advanceTimersByTime(3000));
  expect(current()).toBe("한빛반도체 미국 공장 건설");
  expect(document.querySelector('[data-state="leaving"]')?.textContent).toBe(
    "국회 예산안 처리",
  );
  act(() => vi.advanceTimersByTime(3000 * 2));
  // 끝까지 가면 처음으로 돈다
  expect(current()).toBe("국회 예산안 처리");
  expectMotionSafe();
});

test("마우스를 올리면 멈추고, 내리면 다시 돈다", async () => {
  fakeTicker();
  renderWithProviders(<NewIssues />);
  const list = await screen.findByRole("list", { name: "새로운 이슈" });

  fireEvent.mouseEnter(list);
  act(() => vi.advanceTimersByTime(3000 * 2));
  expect(current()).toBe("국회 예산안 처리");

  fireEvent.mouseLeave(list);
  act(() => vi.advanceTimersByTime(3000));
  expect(current()).toBe("한빛반도체 미국 공장 건설");
});

test("키보드로 링크에 오면 그 이슈가 보이고 멈춘다", async () => {
  fakeTicker();
  renderWithProviders(<NewIssues />);
  await screen.findByRole("list", { name: "새로운 이슈" });

  act(() => screen.getByRole("link", { name: "중동 휴전 협상" }).focus());
  expect(current()).toBe("중동 휴전 협상");
  act(() => vi.advanceTimersByTime(3000 * 2));
  expect(current()).toBe("중동 휴전 협상");
});

test("동작 줄이기를 켜면 돌지 않고 세 이슈를 한 줄에 보인다", async () => {
  fakeTicker();
  stubReducedMotion();
  renderWithProviders(<NewIssues />);
  const list = await screen.findByRole("list", { name: "새로운 이슈" });

  expect(list.querySelectorAll("a")).toHaveLength(3);
  expect(document.querySelector("[data-state]")).toBeNull();
});

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
