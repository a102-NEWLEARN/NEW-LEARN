import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import type { IssueSummary } from "@/api/issues";
import type { Page } from "@/api/types";
import { server } from "@/mocks/node";
import { enterDelay, expectMotionSafe } from "@/test/motion";
import { renderRoute } from "@/test/render";

// 분야별 이슈 화면 (docs/plans/2026-11-12-category-issues.md). 가짜 회원의 관심 분야는 경제 · IT·과학이다

const economy = { code: "economy", name: "경제" };
const politics = { code: "politics", name: "정치" };

// 시험용 이슈 — 경제 30개(id 100 → 71), 정치 2개(50 · 49). 받은 순서가 마지막 사건 최신순이다
function issue(id: number, category = economy): IssueSummary {
  return {
    id,
    title: `이슈 ${id}`,
    summary: null,
    categories: [category],
    eventCount: 3,
    articleCount: 9,
    publisherCount: 3,
    firstEventAt: "2026-10-01T09:00:00+09:00",
    lastEventAt: "2026-11-01T09:00:00+09:00",
    createdAt: "2026-10-01T09:00:00+09:00",
    lastEvent: {
      id: id * 10,
      title: `최근 사건 ${id}`,
      label: "최근",
      occurredAt: "2026-11-01T09:00:00+09:00",
    },
    interested: false,
  };
}
const fixture = [
  ...Array.from({ length: 30 }, (_, at) => issue(100 - at)),
  issue(50, politics),
  issue(49, politics),
];

// A2 를 시험용 이슈로 바꾸고, 받은 인자를 남긴다. 쪽마다 이슈를 다르게 주려면 함수로 넘긴다
function serveIssues(
  items: IssueSummary[] | ((page: number) => IssueSummary[]) = fixture,
) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get("/api/v1/issues", ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push(params);
      const code = params.get("category");
      const page = Number(params.get("page") ?? 0);
      const size = Number(params.get("size") ?? 20);
      const all = typeof items === "function" ? items(page) : items;
      const matched = all.filter(
        (item) => code === null || item.categories.some((c) => c.code === code),
      );
      return HttpResponse.json({
        items: matched.slice(page * size, (page + 1) * size),
        page,
        size,
        totalElements: matched.length,
        totalPages: Math.ceil(matched.length / size),
      } satisfies Page<IssueSummary>);
    }),
  );
  return requests;
}

async function openPage(path = "/issues") {
  const rendered = renderRoute(path);
  await within(screen.getByRole("main")).findByRole("heading", {
    level: 1,
    name: "분야별 이슈",
  });
  return rendered;
}

const ids = (from: number, count: number) =>
  Array.from({ length: count }, (_, at) => `/issues/${from - at}`);

const tabNames = () => screen.getAllByRole("tab").map((tab) => tab.textContent);

const selectedTab = () =>
  screen
    .getAllByRole("tab")
    .find((tab) => tab.getAttribute("aria-selected") === "true");

async function cardList() {
  const panel = await screen.findByRole("tabpanel");
  return within(panel).findByRole("list", { name: "이슈" });
}

async function cardHrefs() {
  return within(await cardList())
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"));
}

test("셸 안에 관심 분야를 앞에 둔 분야 탭을 두고, 첫 관심 분야 이슈를 12개 보인다", async () => {
  const requests = serveIssues();
  await openPage();

  expect(
    screen.getByText("여러 언론사 기사를 사건 단위로 묶어 정리한 이슈예요."),
  ).toBeDefined();
  await screen.findByRole("tablist", { name: "분야" });
  expect(tabNames()).toEqual([
    "경제, 관심 분야",
    "IT·과학, 관심 분야",
    "정치",
    "사회",
    "국제",
  ]);
  expect(selectedTab()?.textContent).toBe("경제, 관심 분야");
  await waitFor(async () => expect(await cardHrefs()).toEqual(ids(100, 12)));
  expect(requests[0].get("category")).toBe("economy");
  expect(requests[0].get("size")).toBe("100");
  expect(requests[0].get("page")).toBe("0");
  await waitFor(() => expect(document.title).toContain("분야별 이슈"));
});

test("?category= 로 열면 그 분야를 고른 채 연다", async () => {
  serveIssues();
  await openPage("/issues?category=politics");

  await screen.findByRole("tablist", { name: "분야" });
  expect(selectedTab()?.textContent).toBe("정치");
  await waitFor(async () =>
    expect(await cardHrefs()).toEqual(["/issues/50", "/issues/49"]),
  );
});

test.each(["nope", "sports"])(
  "모르는 분야나 뺀 분야(?category=%s)면 맨 앞 탭을 고른다",
  async (code) => {
    serveIssues();
    await openPage(`/issues?category=${code}`);

    await screen.findByRole("tablist", { name: "분야" });
    expect(selectedTab()?.textContent).toBe("경제, 관심 분야");
  },
);

test("탭을 바꾸면 기록을 쌓지 않고 ?category= 와 카드가 바뀐다", async () => {
  serveIssues();
  const { router } = await openPage();

  fireEvent.click(await screen.findByRole("tab", { name: "정치" }));

  expect(router.state.location.search).toBe("?category=politics");
  expect(router.state.historyAction).toBe("REPLACE");
  await waitFor(async () =>
    expect(await cardHrefs()).toEqual(["/issues/50", "/issues/49"]),
  );
});

const pager = () => screen.getByRole("navigation", { name: "이슈 쪽" });
const sortGroup = () => screen.getByRole("group", { name: "이슈 정렬" });

// 2026-11-13 사용자 QA 6 — *더 보기* 대신 쪽 번호. 받아 둔 분야 이슈를 12개씩 나눈다 (Jira 203)
test("12개씩 쪽 번호로 나누고, 쪽을 누르면 그 쪽 이슈로 바꿔 첫 카드로 포커스를 옮기고 ?page= 를 남긴다", async () => {
  const requests = serveIssues();
  const { router } = await openPage();

  await waitFor(async () => expect(await cardHrefs()).toEqual(ids(100, 12)));
  expect(screen.queryByRole("button", { name: /더 보기/ })).toBeNull();
  expect(
    within(pager())
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label")),
  ).toEqual(["이전 쪽", "1쪽", "2쪽", "3쪽", "다음 쪽"]);

  fireEvent.click(within(pager()).getByRole("button", { name: "2쪽" }));

  await waitFor(async () => expect(await cardHrefs()).toEqual(ids(88, 12)));
  await waitFor(() =>
    expect(document.activeElement?.getAttribute("href")).toBe("/issues/88"),
  );
  expect(router.state.location.search).toBe("?category=economy&page=2");
  expect(router.state.historyAction).toBe("REPLACE");

  fireEvent.click(within(pager()).getByRole("button", { name: "다음 쪽" }));
  await waitFor(async () => expect(await cardHrefs()).toEqual(ids(76, 6)));
  // 쪽을 넘겨도 다시 받지 않는다 — 처음에 분야 이슈를 모두 받았다
  expect(requests).toHaveLength(1);
});

test("분야 이슈가 100개를 넘으면 다음 쪽을 이어 받아 모두 모은다", async () => {
  const many = Array.from({ length: 130 }, (_, at) => issue(1000 - at));
  const requests = serveIssues(many);
  await openPage();

  await waitFor(async () => expect(await cardHrefs()).toEqual(ids(1000, 12)));
  expect(requests.map((params) => params.get("page"))).toEqual(["0", "1"]);
  expect(within(pager()).getByRole("button", { name: "11쪽" })).toBeDefined();
});

// 2026-11-13 사용자 QA 5 — 최신순 · 기사 많은 순. A2 에 기사 수 정렬이 없어 받은 것을 FE 에서 줄 세운다 (Jira 203)
test("기사 많은 순을 고르면 기사 수가 많은 이슈부터, 같으면 최신순으로 두고 1쪽으로 돌아가 ?sort=articles 를 남긴다", async () => {
  const counted = [
    { ...issue(100), articleCount: 3 },
    { ...issue(99), articleCount: 20 },
    { ...issue(98), articleCount: 9 },
    { ...issue(97), articleCount: 20 },
  ];
  serveIssues(counted);
  const { router } = await openPage();

  await waitFor(async () => expect(await cardHrefs()).toEqual(ids(100, 4)));
  const latest = within(sortGroup()).getByRole("button", { name: "최신순" });
  const most = within(sortGroup()).getByRole("button", {
    name: "기사 많은 순",
  });
  expect(latest.getAttribute("aria-pressed")).toBe("true");

  fireEvent.click(most);

  expect(most.getAttribute("aria-pressed")).toBe("true");
  await waitFor(async () =>
    expect(await cardHrefs()).toEqual([
      "/issues/99",
      "/issues/97",
      "/issues/98",
      "/issues/100",
    ]),
  );
  expect(router.state.location.search).toBe("?category=economy&sort=articles");

  fireEvent.click(latest);
  expect(router.state.location.search).toBe("?category=economy");
});

test("?sort=articles&page=2 로 열면 그 정렬 · 쪽으로 열고, 탭을 바꾸면 1쪽 · 최신순이 아니라 고른 정렬 그대로다", async () => {
  serveIssues();
  const { router } = await openPage(
    "/issues?category=economy&sort=articles&page=2",
  );

  // 시험용 이슈는 기사 수가 모두 같아 최신순과 같은 차례다
  await waitFor(async () => expect(await cardHrefs()).toEqual(ids(88, 12)));
  expect(
    within(sortGroup())
      .getByRole("button", { name: "기사 많은 순" })
      .getAttribute("aria-pressed"),
  ).toBe("true");

  fireEvent.click(screen.getByRole("tab", { name: "정치" }));
  expect(router.state.location.search).toBe("?category=politics&sort=articles");
});

test("쪽 번호가 넘치면 마지막 쪽, 한 쪽뿐이면 쪽 번호를 두지 않는다", async () => {
  serveIssues();
  await openPage("/issues?category=economy&page=9");
  await waitFor(async () => expect(await cardHrefs()).toEqual(ids(76, 6)));

  fireEvent.click(screen.getByRole("tab", { name: "정치" }));
  await waitFor(async () => expect(await cardHrefs()).toHaveLength(2));
  expect(screen.queryByRole("navigation", { name: "이슈 쪽" })).toBeNull();
});

test("분야에 이슈가 없으면 빈 문구를 둔다", async () => {
  serveIssues([]);
  await openPage();

  expect(await screen.findByText("이 분야의 이슈가 아직 없어요")).toBeDefined();
});

test("이슈를 못 불러오면 탭은 두고 그 자리에 다시 시도를 둔다", async () => {
  serveIssues();
  server.use(
    http.get("/api/v1/issues", () => HttpResponse.json(null, { status: 400 }), {
      once: true,
    }),
  );
  await openPage();

  expect(await screen.findByText("이슈를 불러오지 못했어요")).toBeDefined();
  expect(screen.getByRole("tablist", { name: "분야" })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

  await waitFor(async () => expect(await cardHrefs()).toEqual(ids(100, 12)));
});

test("카드는 홈 추천 이슈처럼 45ms 간격으로 떠오른다", async () => {
  serveIssues();
  await openPage();

  const list = await cardList();
  expect(list.getAttribute("class")).toMatch(
    /motion-safe:animate-\[newlearn-rise-in_260ms_/,
  );
  const cards = within(list).getAllByRole("listitem");
  // 8번째부터는 같이 나온다 (appMotion cardAt)
  expect(cards.slice(0, 3).map(enterDelay)).toEqual([0, 45, 90]);
  expectMotionSafe(list);
});
