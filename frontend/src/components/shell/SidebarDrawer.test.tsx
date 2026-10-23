import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { beforeEach, expect, test } from "vitest";
import { server } from "@/mocks/node";
import { stubScreen } from "@/test/media";
import { renderRoute } from "@/test/render";

// 767px 이하 — 사이드바가 서랍이 된다 (EXPERIENCE.md 앱 셸 · Responsive & Platform)
beforeEach(() => {
  stubScreen("narrow");
  // /home 은 개발 확인 화면이라 헬스를 부른다
  server.use(
    http.get("/actuator/health", () => HttpResponse.json({ status: "UP" })),
  );
});

const openMenu = async () =>
  fireEvent.click(await screen.findByRole("button", { name: "메뉴 열기" }));

test("좁은 화면에서는 사이드바 대신 헤더에 메뉴 버튼을 둔다", async () => {
  renderRoute("/home");

  expect(
    await screen.findByRole("button", { name: "메뉴 열기" }),
  ).toBeDefined();
  expect(screen.queryByRole("navigation", { name: "사이드바" })).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("메뉴를 열면 서랍에 이슈 탐색이 보이고 Esc 로 닫힌다", async () => {
  renderRoute("/home");

  await openMenu();
  const drawer = await screen.findByRole("dialog", { name: "메뉴" });
  expect(within(drawer).getByText("이슈 탐색")).toBeDefined();
  expect(
    await within(drawer).findByRole("button", { name: "경제" }),
  ).toBeDefined();

  fireEvent.keyDown(drawer, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("닫기 버튼으로 닫힌다", async () => {
  renderRoute("/home");

  await openMenu();
  const drawer = await screen.findByRole("dialog", { name: "메뉴" });
  fireEvent.click(within(drawer).getByRole("button", { name: "메뉴 닫기" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("이슈를 고르면 그 화면으로 가며 서랍이 닫힌다", async () => {
  const { router } = renderRoute("/home");

  await openMenu();
  const drawer = await screen.findByRole("dialog", { name: "메뉴" });
  fireEvent.click(await within(drawer).findByRole("button", { name: "경제" }));
  fireEvent.click(
    await within(drawer).findByRole("link", {
      name: "한빛반도체 미국 공장 건설",
    }),
  );

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(router.state.location.pathname).toBe("/issues/12");
});

test("Ctrl+\\ 로 서랍을 연다", async () => {
  renderRoute("/home");
  await screen.findByRole("button", { name: "메뉴 열기" });

  fireEvent.keyDown(window, { key: "\\", ctrlKey: true });

  expect(await screen.findByRole("dialog", { name: "메뉴" })).toBeDefined();
});
