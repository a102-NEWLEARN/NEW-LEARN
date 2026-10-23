import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { resizeScreen, stubScreen } from "@/test/media";
import { renderRoute } from "@/test/render";

// 767px 이하 — 사이드바가 서랍이 된다 (EXPERIENCE.md 앱 셸 · Responsive & Platform)
beforeEach(() => {
  stubScreen("narrow");
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

// 서랍(SEED SidePanel)은 닫힐 때 포커스를 메뉴 버튼으로 돌려놓을 수 있다. 그래도 새 화면 제목에 남아야 한다
test("서랍에서 이슈를 고르면 서랍이 닫힌 뒤에도 포커스가 새 화면 제목에 있다", async () => {
  renderRoute("/home");

  await openMenu();
  const drawer = await screen.findByRole("dialog", { name: "메뉴" });
  fireEvent.click(await within(drawer).findByRole("button", { name: "경제" }));
  fireEvent.click(
    await within(drawer).findByRole("link", {
      name: "한빛반도체 미국 공장 건설",
    }),
  );

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const heading = await screen.findByRole("heading", {
    level: 1,
    name: "페이지를 찾을 수 없어요",
  });
  // 서랍이 닫히고 조금 지나도 그대로인지
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(document.activeElement).toBe(heading);
});

// 좁은 화면에서는 이슈를 고를 때마다 서랍이 닫힌다. 다시 열 때 분야를 또 펼치지 않게 한다
test("서랍을 닫았다 열어도 열어 둔 분야가 그대로 열려 있다", async () => {
  renderRoute("/home");

  await openMenu();
  let drawer = await screen.findByRole("dialog", { name: "메뉴" });
  fireEvent.click(await within(drawer).findByRole("button", { name: "경제" }));
  fireEvent.click(
    await within(drawer).findByRole("link", {
      name: "한빛반도체 미국 공장 건설",
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  await openMenu();
  drawer = await screen.findByRole("dialog", { name: "메뉴" });
  expect(
    (await within(drawer).findByRole("button", { name: "경제" })).getAttribute(
      "aria-expanded",
    ),
  ).toBe("true");
});

// 창 폭 조절 · 태블릿 회전으로 768px 을 넘나들 때
test("서랍을 연 채 넓어졌다 다시 좁아져도 서랍이 저절로 열리지 않는다", async () => {
  renderRoute("/home");
  await openMenu();
  await screen.findByRole("dialog", { name: "메뉴" });

  act(() => resizeScreen("wide"));
  expect(
    await screen.findByRole("navigation", { name: "사이드바" }),
  ).toBeDefined();

  act(() => resizeScreen("narrow"));
  await screen.findByRole("button", { name: "메뉴 열기" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("Ctrl+\\ 로 서랍을 연다", async () => {
  renderRoute("/home");
  await screen.findByRole("button", { name: "메뉴 열기" });

  fireEvent.keyDown(window, { key: "\\", ctrlKey: true });

  expect(await screen.findByRole("dialog", { name: "메뉴" })).toBeDefined();
});
