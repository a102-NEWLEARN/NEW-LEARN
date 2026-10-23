import { fireEvent, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import type { IssueSummary } from "@/api/issues";
import type { Member } from "@/api/members";
import type { Page } from "@/api/types";
import { RecommendedIssues } from "@/components/home/RecommendedIssues";
import { server } from "@/mocks/node";
import { renderRoute } from "@/test/render";

// 가짜 A17 과 같은 회원 — 관심 분야 경제 · IT·과학
const member: Member = {
  id: 7,
  loginId: "newlearn01",
  name: "김뉴런",
  categories: [
    { code: "economy", name: "경제" },
    { code: "it_science", name: "IT·과학" },
  ],
};

function renderSection(path = "/home", who: Member | null = member) {
  return renderRoute(path, [
    {
      path: "/home",
      element: <RecommendedIssues member={who} pending={false} />,
    },
  ]);
}

const tabNames = () => screen.getAllByRole("tab").map((tab) => tab.textContent);

const selectedTab = () =>
  screen
    .getAllByRole("tab")
    .find((tab) => tab.getAttribute("aria-selected") === "true");

// 카드 제목들 — 카드마다 링크 하나다
async function cardHrefs() {
  const panel = await screen.findByRole("tabpanel");
  const list = await within(panel).findByRole("list");
  return within(list)
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"));
}

test("회원이면 관심 분야 탭을 앞에 두고 맨 앞 관심 분야를 고른다", async () => {
  renderSection();

  expect(
    screen.getByRole("heading", {
      level: 2,
      name: "김뉴런님을 위한 추천 이슈",
    }),
  ).toBeDefined();
  expect(screen.getByText(/관심 분야예요/)).toBeDefined();
  await screen.findByRole("tablist", { name: "분야" });
  expect(tabNames()).toEqual([
    "경제, 관심 분야",
    "IT·과학, 관심 분야",
    "정치",
    "사회",
    "국제",
  ]);
  expect(selectedTab()?.textContent).toBe("경제, 관심 분야");
  // 경제 이슈 중 마지막 사건 최신순 3개
  expect(await cardHrefs()).toEqual(["/issues/15", "/issues/13", "/issues/12"]);
});

test("손님이면 A1 순서대로 두고 별 안내를 빼고 첫 분야를 고른다", async () => {
  renderSection("/home", null);

  expect(
    screen.getByRole("heading", { level: 2, name: "추천 이슈" }),
  ).toBeDefined();
  expect(screen.queryByText(/관심 분야예요/)).toBeNull();
  await screen.findByRole("tablist", { name: "분야" });
  expect(tabNames()).toEqual(["정치", "사회", "경제", "국제", "IT·과학"]);
  expect(await cardHrefs()).toEqual(["/issues/21", "/issues/22"]);
});

test("탭을 바꾸면 기록을 쌓지 않고 ?category= 와 카드가 바뀐다", async () => {
  const { router } = renderSection();

  fireEvent.click(await screen.findByRole("tab", { name: "국제" }));

  expect(router.state.location.search).toBe("?category=world");
  expect(router.state.historyAction).toBe("REPLACE");
  expect(await cardHrefs()).toEqual(["/issues/41"]);
});

test("?category= 로 열면 그 분야를 고른 채 연다", async () => {
  renderSection("/home?category=world");

  await screen.findByRole("tablist", { name: "분야" });
  expect(selectedTab()?.textContent).toBe("국제");
  expect(await cardHrefs()).toEqual(["/issues/41"]);
});

test.each(["nope", "sports"])(
  "모르는 분야나 준비 중 분야(?category=%s)면 맨 앞 탭을 고른다",
  async (code) => {
    renderSection(`/home?category=${code}`);

    await screen.findByRole("tablist", { name: "분야" });
    expect(selectedTab()?.textContent).toBe("경제, 관심 분야");
  },
);

test("분야에 이슈가 없으면 빈 문구를 둔다", async () => {
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
  renderSection();

  expect(await screen.findByText("이 분야의 이슈가 아직 없어요")).toBeDefined();
});

test("추천 이슈만 못 불러오면 탭은 두고 그 자리에 다시 시도를 둔다", async () => {
  server.use(
    http.get("/api/v1/issues", () => HttpResponse.json(null, { status: 400 }), {
      once: true,
    }),
  );
  renderSection();

  expect(
    await screen.findByText("추천 이슈를 불러오지 못했어요"),
  ).toBeDefined();
  expect(screen.getByRole("tablist", { name: "분야" })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

  expect(await cardHrefs()).toEqual(["/issues/15", "/issues/13", "/issues/12"]);
});

test("A17 을 받는 동안에는 제목도 탭도 그리지 않고 자리만 둔다", () => {
  renderRoute("/home", [
    {
      path: "/home",
      element: <RecommendedIssues member={null} pending />,
    },
  ]);

  expect(
    screen.getByRole("status", { name: "추천 이슈 불러오는 중" }),
  ).toBeDefined();
  // 제목이 「추천 이슈」였다가 「김뉴런님을 위한 추천 이슈」로 바뀌지 않게
  expect(screen.queryByRole("heading")).toBeNull();
  expect(screen.queryByRole("tablist")).toBeNull();
});

test("관심사 편집은 마이페이지로 간다", () => {
  renderSection();

  expect(
    screen.getByRole("link", { name: "관심사 편집" }).getAttribute("href"),
  ).toBe("/me");
});
