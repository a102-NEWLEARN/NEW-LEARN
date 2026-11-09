import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test, vi } from "vitest";
import { server } from "@/mocks/node";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { shellRoute } from "@/routes";
import { expectMotionSafe } from "@/test/motion";
import { renderRoute, renderWithProviders } from "@/test/render";

// 앱과 같은 provider · 라우트 목록으로 연다. provider 를 빼먹으면 첫 화면이 깨지는 것을 여기서 잡는다
test("/home 을 열면 셸 안에 홈을 띄운다", async () => {
  const { router } = renderRoute("/home");

  const header = await screen.findByRole("banner");
  expect(
    within(header)
      .getByRole("link", { name: "NEW:LEARN 홈으로" })
      .getAttribute("href"),
  ).toBe("/home");
  // 본문은 회원인지 확인한 뒤에 뜬다 (RequireMember)
  expect(
    await within(screen.getByRole("main")).findByRole("heading", {
      level: 1,
      name: "오늘의 이슈를 탐색해 보세요",
    }),
  ).toBeDefined();
  expect(router.state.location.pathname).toBe("/home");
});

test("손님이 랜딩 밖 화면을 열면 로그인 화면으로 보내고 그 주소를 next 로 남긴다", async () => {
  server.use(
    http.get("/api/v1/members/me", () =>
      HttpResponse.json(
        {
          type: "about:blank",
          title: "UNAUTHORIZED",
          status: 401,
          detail: "UNAUTHORIZED",
          instance: "/api/v1/members/me",
          code: "UNAUTHORIZED",
        },
        { status: 401 },
      ),
    ),
  );
  const { router } = renderRoute("/issues/12?event=3");

  expect(
    await screen.findByRole("heading", { level: 1, name: "로그인" }),
  ).toBeDefined();
  expect(router.state.location.pathname).toBe("/login");
  expect(new URLSearchParams(router.state.location.search).get("next")).toBe(
    "/issues/12?event=3",
  );
  expect(screen.queryByRole("navigation", { name: "사이드바" })).toBeNull();
});

test("A17 이 손님 말고 다른 오류로 실패하면 막지 않고 화면을 띄운다", async () => {
  let calls = 0;
  server.use(
    http.get("/api/v1/members/me", () => {
      calls += 1;
      return HttpResponse.json(
        {
          type: "about:blank",
          title: "INTERNAL_ERROR",
          status: 500,
          detail: "INTERNAL_ERROR",
          instance: "/api/v1/members/me",
          code: "INTERNAL_ERROR",
        },
        { status: 500 },
      );
    }),
  );
  const { router } = renderRoute("/home");

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "오늘의 이슈를 탐색해 보세요",
    }),
  ).toBeDefined();
  expect(router.state.location.pathname).toBe("/home");
  // 가드가 처음 한 번, 홈이 붙을 때 한 번 더 부른다. 그 뒤로 되풀이하지 않는다
  await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
  expect(calls).toBeLessThanOrEqual(2);
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
  expect(
    await within(main).findByText("화면을 보여 드리지 못했어요"),
  ).toBeDefined();
  // 요청 실패가 아니라 네트워크 안내를 내지 않는다
  expect(
    within(main).getByText(
      "일시적으로 서비스를 사용할 수 없어요. 잠시 후 다시 시도해 주세요.",
    ),
  ).toBeDefined();
  expect(screen.getByRole("banner")).toBeDefined();
});

test("화면마다 탭 제목을 그 화면 이름으로 바꾼다", async () => {
  const { router } = renderRoute("/home");

  await expect.poll(() => document.title).toBe("홈 | NEW:LEARN");
  await act(() => router.navigate("/nope"));
  await expect
    .poll(() => document.title)
    .toBe("페이지를 찾을 수 없어요 | NEW:LEARN");
});

test("다른 화면으로 가면 포커스를 본문 맨 위 제목으로 옮긴다", async () => {
  renderRoute("/home");
  // 처음 열 때는 옮기지 않는다
  expect(document.activeElement).toBe(document.body);

  const newIssues = await screen.findByRole("list", { name: "새로운 이슈" });
  fireEvent.click(within(newIssues).getAllByRole("link")[0]);

  const heading = await screen.findByRole("heading", {
    level: 1,
    name: "국회 예산안 처리",
  });
  expect(document.activeElement).toBe(heading);
});

test("같은 화면에서 ?category= 만 바뀌면 포커스를 옮기지 않는다", async () => {
  const { router } = renderRoute("/home");
  // 추천 이슈의 분야 탭. 최신 기사에도 분야 탭이 있다
  const tabs = await screen.findByRole("tablist", { name: "분야" });
  const tab = within(tabs).getByRole("tab", { name: "국제" });

  act(() => tab.focus());
  fireEvent.click(tab);

  await expect.poll(() => router.state.location.search).toBe("?category=world");
  expect(document.activeElement).toBe(tab);
});

const searchBox = () =>
  screen.getByRole("combobox", { name: "이슈, 사건, 기사 검색" });

test.each([
  ["Ctrl+K", { key: "k", ctrlKey: true }],
  ["⌘K", { key: "k", metaKey: true }],
  // 한글 입력기가 켜져 있으면 글자가 「ㅏ」로 온다 — 키 자리로도 본다
  ["한글 입력기 Ctrl+K", { key: "ㅏ", code: "KeyK", ctrlKey: true }],
])(
  "다른 화면에서 %s 를 누르면 홈 검색창으로 가 포커스한다",
  async (_, keys) => {
    const { router } = renderRoute("/nope");
    await screen.findByRole("heading", { level: 1 });

    fireEvent.keyDown(window, keys);

    await waitFor(() => expect(document.activeElement).toBe(searchBox()));
    expect(router.state.location.pathname).toBe("/home");
    expect(searchBox().getAttribute("aria-expanded")).toBe("true");
  },
);

test.each([
  ["Ctrl+Shift+K", { key: "K", code: "KeyK", ctrlKey: true, shiftKey: true }],
  ["Ctrl+Alt+K", { key: "k", code: "KeyK", ctrlKey: true, altKey: true }],
  // Dvorak 자판은 K 자리에 T 가 있다 — 라틴 글자가 오면 키 자리로 보지 않는다
  ["Dvorak 의 Ctrl+T", { key: "t", code: "KeyK", ctrlKey: true }],
])("%s 는 빠른 이동이 아니다", async (_, keys) => {
  const { router } = renderRoute("/nope");
  await screen.findByRole("heading", { level: 1 });

  fireEvent.keyDown(window, keys);

  expect(router.state.location.pathname).toBe("/nope");
});

test("홈에서 Ctrl+K 를 누르면 고른 분야를 둔 채 검색창에 포커스한다", async () => {
  const { router } = renderRoute("/home?category=world");
  await screen.findByRole("tablist", { name: "분야" });

  fireEvent.keyDown(window, { key: "k", ctrlKey: true });

  await waitFor(() => expect(document.activeElement).toBe(searchBox()));
  expect(router.state.location.search).toBe("?category=world");
});

test("나중에 링크로 홈에 오면 검색창에 저절로 포커스하지 않는다", async () => {
  const { router } = renderRoute("/home");
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  await waitFor(() => expect(document.activeElement).toBe(searchBox()));

  await act(() => router.navigate("/nope"));
  await act(() => router.navigate("/home"));

  expect(document.activeElement).not.toBe(searchBox());
  expect(document.activeElement?.tagName).toBe("H1");
});

test("빠른 이동으로 연 홈에 뒤로 가기로 돌아오면 검색창이 아니라 제목에 포커스한다", async () => {
  const { router } = renderRoute("/nope");
  await screen.findByRole("heading", { level: 1 });
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  await waitFor(() => expect(document.activeElement).toBe(searchBox()));

  await act(() => router.navigate("/issues/12"));
  await act(() => router.navigate(-1));

  expect(router.state.location.pathname).toBe("/home");
  await waitFor(() => expect(document.activeElement?.tagName).toBe("H1"));
  expect(searchBox().getAttribute("aria-expanded")).toBe("false");
});

test("검색창에 포커스가 있는 채 Esc 로 닫아도 Ctrl+K 를 누르면 다시 연다", async () => {
  renderRoute("/home");
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  await waitFor(() => expect(document.activeElement).toBe(searchBox()));
  fireEvent.keyDown(searchBox(), { key: "Escape" });
  expect(searchBox().getAttribute("aria-expanded")).toBe("false");

  fireEvent.keyDown(window, { key: "k", ctrlKey: true });

  await waitFor(() =>
    expect(searchBox().getAttribute("aria-expanded")).toBe("true"),
  );
});

test("화면이 넘긴 제목을 보여 준다", () => {
  renderWithProviders(<NotFoundPage title="이슈를 찾을 수 없어요" />);

  expect(
    screen.getByRole("heading", { level: 1, name: "이슈를 찾을 수 없어요" }),
  ).toBeDefined();
});

test("화면이 바뀔 때마다 본문이 아래에서 떠오르고, 같은 화면에서 쿼리만 바뀌면 다시 그리지 않는다", async () => {
  const { router } = renderRoute("/a", [
    shellRoute([
      { path: "/a", element: <h1 tabIndex={-1}>화면 A</h1> },
      { path: "/b", element: <h1 tabIndex={-1}>화면 B</h1> },
    ]),
  ]);
  const stage = () => screen.getByRole("main").firstElementChild!;

  await screen.findByRole("heading", { level: 1, name: "화면 A" });
  const first = stage();
  // 프로토타입 v21 .im-screen — 10px 아래에서 300ms 로 떠오른다
  expect(first.getAttribute("class")).toMatch(
    /motion-safe:animate-\[newlearn-rise-in_300ms_/,
  );
  // 칸은 내용 높이다 — 본문 높이 칸을 10px 옮기면 본문이 넘쳐 스크롤바가 잠깐 생긴다
  expect(first.getAttribute("class")).not.toMatch(/(^|\s)h-full(\s|$)/);

  await act(() => router.navigate("/a?category=world"));
  expect(stage()).toBe(first);

  await act(() => router.navigate("/b"));
  await screen.findByRole("heading", { level: 1, name: "화면 B" });
  // 새로 그린 칸이다 — 같은 칸이면 애니메이션이 다시 돌지 않는다
  expect(stage()).not.toBe(first);
  expectMotionSafe(screen.getByRole("main"));
});

test("기사 · 이슈 화면은 본문 높이를 채우고 화면 떠오름에서 뺀다 — 181 의 등장이 따로 있다", async () => {
  renderRoute("/issues/7", [
    shellRoute([
      { path: "/issues/:issueId", element: <h1 tabIndex={-1}>이슈</h1> },
    ]),
  ]);

  await screen.findByRole("heading", { level: 1, name: "이슈" });
  const stage = screen.getByRole("main").firstElementChild!;
  expect(stage.getAttribute("class")).toMatch(/(^|\s)h-full(\s|$)/);
  expect(stage.getAttribute("class")).not.toMatch(/animate-/);
});
