import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import type { BookmarkItem } from "@/api/bookmarks";
import type { ItemList } from "@/api/types";
import { problem as apiProblem } from "@/mocks/handlers";
import { server } from "@/mocks/node";
import { enterDelay, expectMotionSafe } from "@/test/motion";
import { renderRoute } from "@/test/render";

// 나의 뉴스함 (docs/plans/2026-11-03-bookmarks.md). 가짜 회원은 407(10-27) · 11902(10-26) · 403(10-24) 순으로 담았다.
// 관심 이슈 섹션은 components/bookmarks/InterestIssues.test.tsx (2026-11-16 마이페이지에서 옮김)

async function openPage() {
  const rendered = renderRoute("/bookmarks");
  await within(screen.getByRole("main")).findByRole("heading", {
    level: 1,
    name: "나의 뉴스함",
  });
  return rendered;
}

const articleLinks = (list: HTMLElement) =>
  within(list)
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"))
    .filter((href) => href?.startsWith("/articles/"));

test("셸 안에 북마크한 기사를 최근에 담은 순서대로 보인다", async () => {
  await openPage();

  expect(screen.getByText("저장한 이슈와 기사를 모아 뒀어요.")).toBeDefined();
  const section = await within(screen.getByRole("main")).findByRole("region", {
    name: "북마크한 기사",
  });
  expect(
    within(section).getByText("최근에 담은 기사부터 보여줘요."),
  ).toBeDefined();
  const list = await within(section).findByRole("list", {
    name: "북마크한 기사",
  });
  expect(articleLinks(list)).toEqual([
    "/articles/407",
    "/articles/11902",
    "/articles/403",
  ]);
  // 담은 기사라 북마크 버튼이 눌린 채다
  const buttons = within(list).getAllByRole("button", {
    name: /나의 뉴스함에 담기$/,
  });
  expect(
    buttons.every((button) => button.getAttribute("aria-pressed") === "true"),
  ).toBe(true);
  await waitFor(() => expect(document.title).toContain("나의 뉴스함"));
});

test("담은 기사가 없으면 북마크를 눌러 보라고 안내한다", async () => {
  server.use(
    http.get("/api/v1/members/me/bookmarks", () =>
      HttpResponse.json({ items: [] } satisfies ItemList<BookmarkItem>),
    ),
  );
  await openPage();

  expect(
    await screen.findByText(
      "아직 담은 기사가 없어요. 기사 옆 북마크를 누르면 여기에 모여요.",
    ),
  ).toBeDefined();
});

test("불러오지 못하면 그 자리에 안내와 다시 시도를 두고, 관심 이슈는 그대로 보인다", async () => {
  let fail = true;
  server.use(
    http.get("/api/v1/members/me/bookmarks", () =>
      fail ? HttpResponse.json(null, { status: 500 }) : undefined,
    ),
  );
  await openPage();

  expect(
    await screen.findByText("북마크한 기사를 불러오지 못했어요"),
  ).toBeDefined();
  expect(await screen.findByRole("list", { name: "관심 이슈" })).toBeDefined();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

  expect(
    await screen.findByRole("list", { name: "북마크한 기사" }),
  ).toBeDefined();
});

// 세션이 끝났으면 「불러오지 못했어요」 대신 로그인 화면으로 — 로그인하면 이 화면으로 돌아온다 (Jira 165)
test("목록을 받다가 세션이 끝났으면(401) 로그인 화면으로 보낸다", async () => {
  server.use(
    http.get("/api/v1/members/me/bookmarks", () =>
      HttpResponse.json(
        {
          type: "about:blank",
          title: "UNAUTHORIZED",
          status: 401,
          detail: "UNAUTHORIZED",
          instance: "/api/v1/members/me/bookmarks",
          code: "UNAUTHORIZED",
        },
        { status: 401 },
      ),
    ),
  );
  const { router } = renderRoute("/bookmarks");

  await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  expect(router.state.location.search).toBe("?next=/bookmarks");
});

// 관심 이슈 목록(A25)이 401 이어도 같다 (마이페이지에 있던 시험을 옮김, Jira 165)
test("관심 이슈를 받다가 세션이 끝났으면(401) 로그인 화면으로 보낸다", async () => {
  server.use(
    http.get("/api/v1/members/me/interest-issues", () =>
      apiProblem(
        401,
        "UNAUTHORIZED",
        "UNAUTHORIZED",
        "/api/v1/members/me/interest-issues",
      ),
    ),
  );
  const { router } = renderRoute("/bookmarks");

  await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  expect(router.state.location.search).toBe("?next=/bookmarks");
});

test("담은 기사 행이 30ms 간격으로 떠오르고, 마우스를 올리면 「마인드맵 보기」가 나타난다", async () => {
  await openPage();

  const list = await screen.findByRole("list", { name: "북마크한 기사" });
  const rows = within(list).getAllByRole("listitem");
  // 프로토타입 v21 ul > li — 380ms, 30ms 간격
  expect(rows[0].getAttribute("class")).toMatch(
    /motion-safe:animate-\[newlearn-rise-in_380ms_/,
  );
  expect(rows.map(enterDelay)).toEqual([0, 30, 60]);
  expect(within(list).getAllByText("마인드맵 보기")).toHaveLength(3);
  expectMotionSafe(list);
});
