import { QueryObserver } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import { meQuery } from "@/api/members";
import { problem as apiProblem } from "@/mocks/handlers";
import { server } from "@/mocks/node";
import { renderRoute } from "@/test/render";

// 마이페이지 첫 판과 A16 로그아웃 (docs/plans/2026-11-03-logout.md). 회원은 handlers.ts 의 A17 예시다

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

// 보내는 동안에는 SEED 가 버튼 안에 진행 표시를 넣어 이름이 「loading... 로그아웃」이 된다
const logoutButton = () => screen.getByRole("button", { name: /로그아웃/ });

async function openMyPage() {
  const rendered = renderRoute("/me");
  await within(screen.getByRole("main")).findByRole("heading", {
    level: 1,
    name: "김뉴런님",
  });
  return rendered;
}

test("셸 안에 이름 · 아이디와 로그아웃 버튼을 띄운다", async () => {
  await openMyPage();

  const main = screen.getByRole("main");
  const info = within(main).getByRole("region", { name: "개인정보" });
  expect(within(info).getByText("김뉴런")).toBeDefined();
  expect(within(info).getByText("newlearn01")).toBeDefined();
  expect(logoutButton()).toBeDefined();
  expect(document.title).toContain("마이페이지");
});

test("헤더의 마이페이지를 누르면 마이페이지로 간다", async () => {
  const { router } = renderRoute("/home");

  const header = await screen.findByRole("banner");
  fireEvent.click(within(header).getByRole("link", { name: "마이페이지" }));

  expect(
    await screen.findByRole("heading", { level: 1, name: "김뉴런님" }),
  ).toBeDefined();
  expect(router.state.location.pathname).toBe("/me");
});

test("로그아웃하면 랜딩으로 가서 「로그아웃했어요」를 띄우고 손님이 된다", async () => {
  const calls = logoutAnswers(noContent);
  const { router, queryClient } = await openMyPage();

  fireEvent.click(logoutButton());

  await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  expect(await screen.findByText("로그아웃했어요")).toBeDefined();
  expect(calls.count).toBe(1);
  expect(queryClient.getQueryData(meQuery.queryKey)).toBeNull();
});

test("로그아웃하면 이전 회원이 받아 둔 응답을 지켜보는 화면이 있어도 모두 버린다", async () => {
  const { router, queryClient } = await openMyPage();
  // 회원 기준 값(bookmarked · interested)이 든 응답을 받아 둔 셈 친다. 이슈 응답은 지금 화면이 지켜보는 중이다
  const articleKey = ["articles", 101];
  const issueKey = ["issues", 12];
  queryClient.setQueryData(articleKey, { id: 101, bookmarked: true });
  queryClient.setQueryData(issueKey, { id: 12, interested: true });
  const watching = new QueryObserver(queryClient, {
    queryKey: issueKey,
    staleTime: Infinity,
  }).subscribe(() => {});

  fireEvent.click(logoutButton());

  await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  expect(queryClient.getQueryData(articleKey)).toBeUndefined();
  expect(queryClient.getQueryData(issueKey)).toBeUndefined();
  watching();
});

test("세션이 이미 끊겼으면(401) 로그아웃한 것과 같이 랜딩으로 간다", async () => {
  logoutAnswers(() => problem(401, "UNAUTHORIZED"));
  const { router, queryClient } = await openMyPage();

  fireEvent.click(logoutButton());

  await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  expect(await screen.findByText("로그아웃했어요")).toBeDefined();
  expect(queryClient.getQueryData(meQuery.queryKey)).toBeNull();
});

test("로그아웃에 실패하면 버튼 아래에 안내를 띄우고 마이페이지에 남는다", async () => {
  logoutAnswers(() => problem(500, "INTERNAL_ERROR"));
  const { router, queryClient } = await openMyPage();

  fireEvent.click(logoutButton());

  expect((await screen.findByRole("alert")).textContent).toContain(
    "잠시 후 다시 시도해 주세요",
  );
  expect(router.state.location.pathname).toBe("/me");
  expect(queryClient.getQueryData(meQuery.queryKey)).toMatchObject({
    loginId: "newlearn01",
  });
});

test("CSRF 번호표가 틀리면(403) 세션이 남았을 수 있어 안내를 띄우고 마이페이지에 남는다", async () => {
  logoutAnswers(() => problem(403, "FORBIDDEN"));
  const { router } = await openMyPage();

  fireEvent.click(logoutButton());

  expect(await screen.findByRole("alert")).toBeDefined();
  expect(router.state.location.pathname).toBe("/me");
  expect(screen.queryByText("로그아웃했어요")).toBeNull();
});

test("다시 누르면 보내는 동안 실패 안내를 지우고, 성공하면 랜딩으로 간다", async () => {
  let fail = true;
  const second = heldAnswer(noContent);
  const calls = logoutAnswers(() =>
    fail ? problem(500, "INTERNAL_ERROR") : second.held(),
  );
  const { router } = await openMyPage();

  fireEvent.click(logoutButton());
  await screen.findByRole("alert");
  fail = false;
  fireEvent.click(logoutButton());

  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(router.state.location.pathname).toBe("/me");
  second.release();
  await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  expect(calls.count).toBe(2);
});

test("보내는 동안 다시 눌러도 한 번만 보낸다", async () => {
  const answer = heldAnswer(noContent);
  const calls = logoutAnswers(answer.held);
  const { router } = await openMyPage();

  fireEvent.click(logoutButton());
  await waitFor(() =>
    expect(logoutButton().getAttribute("aria-busy")).toBe("true"),
  );
  fireEvent.click(logoutButton());
  answer.release();

  await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  expect(calls.count).toBe(1);
});

// 이름 아래 머리 줄 — 모바일 v1 · v21 MyPageScreen (Jira 163). 관심 분야는 저장된 것(A17), 관심 이슈는 A25, 북마크는 A22 의 개수
test("이름 아래에 관심 분야 · 관심 이슈 · 북마크 개수를 보인다", async () => {
  await openMyPage();

  expect(
    await within(screen.getByRole("main")).findByText(
      "관심 분야 2개 · 관심 이슈 2개 · 북마크 3개",
    ),
  ).toBeDefined();
});

test("개수 하나라도 못 받으면 머리 줄을 그리지 않는다", async () => {
  server.use(
    http.get("/api/v1/members/me/bookmarks", () =>
      apiProblem(
        500,
        "INTERNAL_ERROR",
        "서버 오류",
        "/api/v1/members/me/bookmarks",
      ),
    ),
  );
  await openMyPage();
  // 관심 이슈 목록이 그려질 때까지 기다린 뒤에도 줄이 없다
  await within(screen.getByRole("main")).findByRole("link", {
    name: /한빛반도체 미국 공장 건설/,
  });

  expect(screen.queryByText(/관심 분야 \d+개/)).toBeNull();
});
