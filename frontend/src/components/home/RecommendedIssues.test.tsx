import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, onTestFinished, test } from "vitest";
import type { InterestIssueItem } from "@/api/interestIssues";
import type { IssueSummary } from "@/api/issues";
import type { Member } from "@/api/members";
import type { Page } from "@/api/types";
import { RecommendedIssues } from "@/components/home/RecommendedIssues";
import { server } from "@/mocks/node";
import { enterDelay, expectMotionSafe } from "@/test/motion";
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

// A25 를 몇 번 불렀나
function countInterestCalls() {
  const calls: string[] = [];
  const count = ({ request }: { request: Request }) => {
    if (new URL(request.url).pathname === "/api/v1/members/me/interest-issues")
      calls.push(request.method);
  };
  server.events.on("request:start", count);
  onTestFinished(() => {
    server.events.removeListener("request:start", count);
  });
  return calls;
}

// A25 항목 — 경제 이슈. 순서에 쓰는 마지막 사건 시각만 다르게 준다
function interestItem(id: number, lastEventAt: string): InterestIssueItem {
  return {
    id,
    title: `관심 이슈 ${id}`,
    summary: null,
    categories: [{ code: "economy", name: "경제" }],
    eventCount: 3,
    articleCount: 9,
    publisherCount: 3,
    firstEventAt: "2025-09-02T09:00:00+09:00",
    lastEventAt,
    createdAt: "2025-09-02T09:00:00+09:00",
    lastEvent: {
      id: id * 10,
      title: "최근 사건",
      label: "최근",
      occurredAt: lastEventAt,
    },
    interested: true,
    interestedAt: "2026-10-27T08:30:00+09:00",
  };
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
  // 가짜 회원의 관심 이슈 12(경제) 를 먼저, 그다음 경제 이슈를 마지막 사건 최신순으로. 관심 이슈 21 은 정치라 빠진다
  expect(await cardHrefs()).toEqual(["/issues/12", "/issues/15", "/issues/13"]);
});

test("손님이면 A1 순서대로 두고 별 안내를 빼고 첫 분야를 고른다", async () => {
  const interestCalls = countInterestCalls();
  renderSection("/home", null);

  expect(
    screen.getByRole("heading", { level: 2, name: "추천 이슈" }),
  ).toBeDefined();
  expect(screen.queryByText(/관심 분야예요/)).toBeNull();
  await screen.findByRole("tablist", { name: "분야" });
  expect(tabNames()).toEqual(["정치", "사회", "경제", "국제", "IT·과학"]);
  expect(await cardHrefs()).toEqual(["/issues/21", "/issues/22"]);
  // 손님은 관심 이슈가 없다 — A25 를 부르지 않는다
  expect(interestCalls).toHaveLength(0);
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
    // 이슈가 없으면 관심 이슈도 없다
    http.get("/api/v1/members/me/interest-issues", () =>
      HttpResponse.json({ items: [] }),
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

  expect(await cardHrefs()).toEqual(["/issues/12", "/issues/15", "/issues/13"]);
});

// 관심 이슈 먼저 (PRD FR-28 · 프로토타입 v21, Jira 172)

test("A2 앞 3개 밖의 관심 이슈도 앞에 두고, 관심 이슈끼리는 마지막 사건 최신순이다", async () => {
  server.use(
    http.get("/api/v1/members/me/interest-issues", () =>
      HttpResponse.json({
        items: [
          // 저장한 순서와 상관없이 마지막 사건이 최근인 14 가 앞이다
          interestItem(12, "2026-09-01T09:00:00+09:00"),
          interestItem(14, "2026-10-01T09:00:00+09:00"),
        ],
      }),
    ),
  );
  renderSection();

  // A2 경제 앞 3개는 15 · 13 · 12 — 14 는 그 밖이지만 관심 이슈라 맨 앞
  expect(await cardHrefs()).toEqual(["/issues/14", "/issues/12", "/issues/15"]);
});

test("관심 이슈를 받는 동안은 카드 자리만 두고, 받으면 관심 이슈를 앞에 두고 그린다", async () => {
  let release: () => void = () => {};
  server.use(
    http.get(
      "/api/v1/members/me/interest-issues",
      () =>
        new Promise<Response>((resolve) => {
          release = () =>
            resolve(
              HttpResponse.json({
                items: [interestItem(12, "2026-09-01T09:00:00+09:00")],
              }),
            );
        }),
    ),
  );
  const { queryClient } = renderSection();

  // A2 는 먼저 왔다 — 그래도 A2 순서로 그렸다가 바꾸지 않고 자리만 둔다
  await waitFor(() =>
    expect(
      queryClient
        .getQueriesData<Page<IssueSummary>>({ queryKey: ["issues"] })
        .some(([, page]) => page !== undefined),
    ).toBe(true),
  );
  const panel = await screen.findByRole("tabpanel");
  expect(
    within(panel).getByRole("status", { name: "추천 이슈 불러오는 중" }),
  ).toBeDefined();
  expect(within(panel).queryAllByRole("link")).toHaveLength(0);

  release();

  expect(await cardHrefs()).toEqual(["/issues/12", "/issues/15", "/issues/13"]);
});

test("관심 이슈를 못 불러오면 A2 순서 그대로 보인다", async () => {
  server.use(
    http.get("/api/v1/members/me/interest-issues", () =>
      HttpResponse.json(null, { status: 500 }),
    ),
  );
  renderSection();

  expect(await cardHrefs()).toEqual(["/issues/15", "/issues/13", "/issues/12"]);
  expect(screen.queryByText("추천 이슈를 불러오지 못했어요")).toBeNull();
});

test("관심 이슈 카드에는 「관심 이슈」 표시가 붙는다", async () => {
  renderSection();

  await cardHrefs();
  const first = within(await screen.findByRole("tabpanel"))
    .getAllByRole("link")
    .at(0);
  expect(first?.textContent).toContain("관심 이슈");
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

test("카드가 45ms 간격으로 떠오르고, 분야를 바꾸면 묶음을 새로 그려 다시 떠오른다", async () => {
  renderSection();
  const cardList = async () =>
    within(await screen.findByRole("tabpanel")).findByRole("list");

  const first = await cardList();
  // 프로토타입 v21 — 묶음 im-rise 260ms, 카드 .grid > * 440ms
  expect(first.getAttribute("class")).toMatch(
    /motion-safe:animate-\[newlearn-rise-in_260ms_/,
  );
  const cards = within(first).getAllByRole("listitem");
  expect(cards[0].getAttribute("class")).toMatch(
    /motion-safe:animate-\[newlearn-rise-in_440ms_/,
  );
  expect(cards.map(enterDelay)).toEqual([0, 45, 90].slice(0, cards.length));
  expectMotionSafe(first);

  fireEvent.click(await screen.findByRole("tab", { name: "국제" }));
  await waitFor(async () => expect(await cardHrefs()).toEqual(["/issues/41"]));
  expect(await cardList()).not.toBe(first);
});

test("이미 본 분야로 돌아와 받아 둔 것으로 바로 그려도 묶음을 새로 그려 다시 떠오른다", async () => {
  renderSection();
  const cardList = async () =>
    within(await screen.findByRole("tabpanel")).findByRole("list");

  await cardList();
  fireEvent.click(await screen.findByRole("tab", { name: "국제" }));
  await waitFor(async () => expect(await cardHrefs()).toEqual(["/issues/41"]));
  const world = await cardList();

  fireEvent.click(screen.getByRole("tab", { name: /경제/ }));
  await waitFor(async () =>
    expect(await cardHrefs()).not.toEqual(["/issues/41"]),
  );
  expect(await cardList()).not.toBe(world);
});
