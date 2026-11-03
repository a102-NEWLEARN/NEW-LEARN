import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import type { BookmarkItem } from "@/api/bookmarks";
import type { ItemList } from "@/api/types";
import { server } from "@/mocks/node";
import { renderRoute } from "@/test/render";

// 나의 뉴스함 (docs/plans/2026-11-03-bookmarks.md). 가짜 회원은 407(10-27) · 11902(10-26) · 403(10-24) 순으로 담았다

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

test("셸 안에 담은 기사를 최근에 담은 순서대로 보인다", async () => {
  await openPage();

  expect(
    screen.getByText(
      "북마크한 기사를 모아 뒀어요. 최근에 담은 기사부터 보여줘요.",
    ),
  ).toBeDefined();
  const list = await screen.findByRole("list", { name: "담은 기사" });
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

test("불러오지 못하면 그 자리에 안내와 다시 시도를 둔다", async () => {
  let fail = true;
  server.use(
    http.get("/api/v1/members/me/bookmarks", () =>
      fail ? HttpResponse.json(null, { status: 500 }) : undefined,
    ),
  );
  await openPage();

  expect(
    await screen.findByText("나의 뉴스함을 불러오지 못했어요"),
  ).toBeDefined();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

  expect(await screen.findByRole("list", { name: "담은 기사" })).toBeDefined();
});
