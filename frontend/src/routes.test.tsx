import { screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { shellRoute } from "@/routes";
import { renderRoute, renderWithProviders } from "@/test/render";

// 앱과 같은 provider · 라우트 목록으로 연다. provider 를 빼먹으면 첫 화면이 깨지는 것을 여기서 잡는다
test("/ 를 열면 셸 안의 /home 홈으로 간다", async () => {
  const { router } = renderRoute("/");

  const header = await screen.findByRole("banner");
  expect(
    within(header)
      .getByRole("link", { name: "NEW:LEARN 홈으로" })
      .getAttribute("href"),
  ).toBe("/home");
  expect(
    within(screen.getByRole("main")).getByRole("heading", {
      level: 1,
      name: "오늘의 이슈를 탐색해 보세요",
    }),
  ).toBeDefined();
  expect(router.state.location.pathname).toBe("/home");
});

test("없는 주소도 셸 안에 찾을 수 없음 화면을 띄운다", async () => {
  renderRoute("/nope");

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "페이지를 찾을 수 없어요",
    }),
  ).toBeDefined();
  expect(screen.getByRole("banner")).toBeDefined();
  expect(
    within(screen.getByRole("main"))
      .getByRole("link", { name: "홈으로" })
      .getAttribute("href"),
  ).toBe("/home");
});

test("화면이 렌더 중 터지면 셸은 두고 본문 자리에 오류 안내를 띄운다", async () => {
  // React 와 라우터가 잡은 오류를 콘솔에 찍는다. 일부러 터뜨리는 테스트라 가린다
  vi.spyOn(console, "error").mockImplementation(() => {});
  function Broken(): never {
    throw new Error("화면 코드 버그");
  }
  renderRoute("/broken", [
    shellRoute([{ path: "/broken", element: <Broken /> }]),
  ]);

  const main = await screen.findByRole("main");
  expect(within(main).getByText("화면을 보여 드리지 못했어요")).toBeDefined();
  // 요청 실패가 아니라 네트워크 안내를 내지 않는다
  expect(
    within(main).getByText(
      "일시적으로 서비스를 사용할 수 없어요. 잠시 후 다시 시도해 주세요.",
    ),
  ).toBeDefined();
  expect(screen.getByRole("banner")).toBeDefined();
});

test("화면이 넘긴 제목을 보여 준다", () => {
  renderWithProviders(<NotFoundPage title="이슈를 찾을 수 없어요" />);

  expect(
    screen.getByRole("heading", { level: 1, name: "이슈를 찾을 수 없어요" }),
  ).toBeDefined();
});
