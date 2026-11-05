import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import type { ItemList } from "@/api/types";
import { server } from "@/mocks/node";
import { renderRoute } from "@/test/render";

// 마이페이지 관심 이슈 (docs/plans/2026-11-03-interest-issues.md). 가짜 회원은 12번(경제, 나중에 저장) · 21번(정치)을 저장해 두었다

async function openSection() {
  const rendered = renderRoute("/me");
  const section = await within(screen.getByRole("main")).findByRole("region", {
    name: "관심 이슈",
  });
  return { ...rendered, section };
}

test("마이페이지 맨 끝 섹션(개인정보 · 관심 분야 다음)으로 저장한 이슈를 저장한 순서대로 보인다", async () => {
  const { section } = await openSection();

  const headings = within(screen.getByRole("main"))
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent);
  expect(headings).toEqual(["개인정보", "관심 분야", "관심 이슈"]);
  expect(within(section).getByText("별표로 저장한 이슈예요.")).toBeDefined();

  const list = await within(section).findByRole("list", { name: "관심 이슈" });
  const links = within(list).getAllByRole("link");
  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    "/issues/12",
    "/issues/21",
  ]);
  expect(links[0].textContent).toMatch(/^한빛반도체.*경제 · 사건 \d+개$/);
});

test("누르면 그 이슈 화면으로 간다", async () => {
  const { section, router } = await openSection();
  const list = await within(section).findByRole("list", { name: "관심 이슈" });

  fireEvent.click(within(list).getAllByRole("link")[1]);

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/issues/21"),
  );
});

test("저장한 이슈가 없으면 별표를 눌러 보라고 안내한다", async () => {
  server.use(
    http.get("/api/v1/members/me/interest-issues", () =>
      HttpResponse.json({ items: [] } satisfies ItemList<never>),
    ),
  );
  const { section } = await openSection();

  expect(
    await within(section).findByText(
      "아직 저장한 이슈가 없어요. 이슈 이름 옆 별표를 눌러 보세요.",
    ),
  ).toBeDefined();
});

test("불러오지 못하면 그 자리에 안내와 다시 시도를 둔다", async () => {
  let fail = true;
  server.use(
    http.get("/api/v1/members/me/interest-issues", () =>
      fail ? HttpResponse.json(null, { status: 500 }) : undefined,
    ),
  );
  const { section } = await openSection();

  expect(
    await within(section).findByText("관심 이슈를 불러오지 못했어요"),
  ).toBeDefined();
  fail = false;
  fireEvent.click(within(section).getByRole("button", { name: "다시 시도" }));

  expect(
    await within(section).findByRole("list", { name: "관심 이슈" }),
  ).toBeDefined();
});
