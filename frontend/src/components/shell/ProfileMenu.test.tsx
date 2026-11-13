import { QueryObserver } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import { meQuery } from "@/api/members";
import { problem as apiProblem } from "@/mocks/handlers";
import { server } from "@/mocks/node";
import { renderRoute } from "@/test/render";

// 헤더 프로필 메뉴 — 마이페이지 · 로그아웃(A16). 로그아웃은 마이페이지 이름 줄에서 여기로 옮겼다
// (2026-11-05 사용자, S15P31A102-182 · 처음 판은 docs/plans/2026-11-03-logout.md). 회원은 handlers.ts 의 A17 예시다

const problem = (status: number, code: string) =>
  apiProblem(status, code, code, "/api/v1/auth/logout");

const noContent = () => new HttpResponse(null, { status: 204 });

// 응답을 붙잡아 두었다가 release 를 부르면 그때 답한다
function heldAnswer(response: () => Response) {
  let release: () => void = () => {};
  const held = () =>
    new Promise<Response>((resolve) => {
      release = () => resolve(response());
    });
  return { held, release: () => release() };
}

// A16 이 이 응답을 준다. 몇 번 불렀는지 센다
function logoutAnswers(response: () => Response | Promise<Response>) {
  const calls = { count: 0 };
  server.use(
    http.post("/api/v1/auth/logout", () => {
      calls.count += 1;
      return response();
    }),
  );
  return calls;
}

// 셸 헤더 — 이슈 화면처럼 본문에도 <header> 가 있는 화면이 있어 로고로 찾는다
const shellHeader = () =>
  screen.getByRole("link", { name: "NEW:LEARN 홈으로" }).closest("header")!;

async function openMenu(path = "/home") {
  const rendered = renderRoute(path);
  await screen.findByRole("link", { name: "NEW:LEARN 홈으로" });
  // 헤더 오른쪽 버튼은 회원인지 안 뒤에 그린다 (Header)
  fireEvent.click(
    await within(shellHeader()).findByRole("button", { name: "마이페이지" }),
  );
  const menu = await screen.findByRole("menu");
  return { ...rendered, menu };
}

// 보내는 동안에도 이름은 「로그아웃」이다(진행은 aria-busy)
const logoutItem = () => screen.getByRole("menuitem", { name: /로그아웃/ });
// 닫힌 메뉴는 DOM 에 남고 SEED CSS([data-hidden] → display: none)가 숨긴다. jsdom 은 CSS 가 없어 버튼의 aria-expanded 로 본다
const trigger = () =>
  within(shellHeader()).getByRole("button", {
    name: "마이페이지",
  });

test("헤더의 마이페이지 버튼은 메뉴를 열고, 메뉴에는 마이페이지 · 로그아웃이 있다", async () => {
  const { menu } = await openMenu();

  expect(trigger().getAttribute("aria-haspopup")).toBe("menu");
  expect(trigger().getAttribute("aria-expanded")).toBe("true");
  expect(
    within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent),
  ).toEqual(["마이페이지", "로그아웃"]);
});

test("메뉴의 마이페이지를 누르면 마이페이지로 가고 메뉴가 닫힌다", async () => {
  const { menu, router } = await openMenu();

  fireEvent.click(within(menu).getByRole("menuitem", { name: "마이페이지" }));

  expect(
    await screen.findByRole("heading", { level: 1, name: "김뉴런님" }),
  ).toBeDefined();
  expect(router.state.location.pathname).toBe("/me");
  await waitFor(() =>
    expect(trigger().getAttribute("aria-expanded")).toBe("false"),
  );
});

test("Esc 로 메뉴를 닫는다", async () => {
  await openMenu();

  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: "Escape",
  });

  await waitFor(() =>
    expect(trigger().getAttribute("aria-expanded")).toBe("false"),
  );
});

test("로그아웃하면 랜딩으로 가서 「로그아웃했어요」를 띄우고 손님이 된다", async () => {
  const calls = logoutAnswers(noContent);
  const { router, queryClient } = await openMenu();

  fireEvent.click(logoutItem());

  await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  expect(await screen.findByText("로그아웃했어요")).toBeDefined();
  expect(calls.count).toBe(1);
  expect(queryClient.getQueryData(meQuery.queryKey)).toBeNull();
});

// 셸의 세션 만료 감시(SessionExpiredRedirect)는 「회원이던 사람의 내 정보가 비면」 로그인 화면으로 보낸다.
// 로그아웃도 내 정보를 비우지만 랜딩에 남아야 한다 — 잠깐 랜딩이었다가 로그인 화면으로 새지 않는지 조금 기다려 본다 (리뷰, Jira 205)
test.each(["/home", "/issues/12", "/me", "/bookmarks"])(
  "%s 에서 로그아웃해도 로그인 화면으로 새지 않고 랜딩에 남는다",
  async (path) => {
    logoutAnswers(noContent);
    const { router } = await openMenu(path);

    fireEvent.click(logoutItem());

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(router.state.location.pathname).toBe("/");
  },
);

test("로그아웃하면 이전 회원이 받아 둔 응답을 지켜보는 화면이 있어도 모두 버린다", async () => {
  const { router, queryClient } = await openMenu();
  // 회원 기준 값(bookmarked · interested)이 든 응답을 받아 둔 셈 친다. 이슈 응답은 지금 화면이 지켜보는 중이다
  const articleKey = ["articles", 101];
  const issueKey = ["issues", 12];
  queryClient.setQueryData(articleKey, { id: 101, bookmarked: true });
  queryClient.setQueryData(issueKey, { id: 12, interested: true });
  const watching = new QueryObserver(queryClient, {
    queryKey: issueKey,
    staleTime: Infinity,
  }).subscribe(() => {});

  fireEvent.click(logoutItem());

  await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  expect(queryClient.getQueryData(articleKey)).toBeUndefined();
  expect(queryClient.getQueryData(issueKey)).toBeUndefined();
  watching();
});

test("세션이 이미 끊겼으면(401) 로그아웃한 것과 같이 랜딩으로 간다", async () => {
  logoutAnswers(() => problem(401, "UNAUTHORIZED"));
  const { router, queryClient } = await openMenu();

  fireEvent.click(logoutItem());

  await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  expect(await screen.findByText("로그아웃했어요")).toBeDefined();
  expect(queryClient.getQueryData(meQuery.queryKey)).toBeNull();
});

// 오류는 스낵바가 아니라 실패한 자리에 둔다 (useSnackbar) — 메뉴를 열어 둔 채 로그아웃 아래에
test("로그아웃에 실패하면 메뉴를 닫지 않고 로그아웃 아래에 안내를 띄우고 그 화면에 남는다", async () => {
  logoutAnswers(() => problem(500, "INTERNAL_ERROR"));
  const { router, queryClient } = await openMenu("/me");

  fireEvent.click(logoutItem());

  const menu = screen.getByRole("menu");
  expect((await within(menu).findByRole("alert")).textContent).toContain(
    "잠시 후 다시 시도해 주세요",
  );
  expect(router.state.location.pathname).toBe("/me");
  expect(queryClient.getQueryData(meQuery.queryKey)).toMatchObject({
    loginId: "newlearn01",
  });
});

test("CSRF 번호표가 틀리면(403) 세션이 남았을 수 있어 안내를 띄우고 그 화면에 남는다", async () => {
  logoutAnswers(() => problem(403, "FORBIDDEN"));
  const { router } = await openMenu();

  fireEvent.click(logoutItem());

  expect(await screen.findByRole("alert")).toBeDefined();
  expect(router.state.location.pathname).toBe("/home");
  expect(screen.queryByText("로그아웃했어요")).toBeNull();
});

test("다시 누르면 보내는 동안 실패 안내를 지우고, 성공하면 랜딩으로 간다", async () => {
  let fail = true;
  const second = heldAnswer(noContent);
  const calls = logoutAnswers(() =>
    fail ? problem(500, "INTERNAL_ERROR") : second.held(),
  );
  const { router } = await openMenu();

  fireEvent.click(logoutItem());
  await screen.findByRole("alert");
  fail = false;
  fireEvent.click(logoutItem());

  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(router.state.location.pathname).toBe("/home");
  second.release();
  await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  expect(calls.count).toBe(2);
});

test("보내는 동안에는 메뉴를 열어 두고, 다시 눌러도 한 번만 보낸다", async () => {
  const answer = heldAnswer(noContent);
  const calls = logoutAnswers(answer.held);
  const { router } = await openMenu();

  fireEvent.click(logoutItem());
  await waitFor(() =>
    expect(logoutItem().getAttribute("aria-busy")).toBe("true"),
  );
  expect(screen.getByRole("menu")).toBeDefined();
  fireEvent.click(logoutItem());
  answer.release();

  await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  expect(calls.count).toBe(1);
});
