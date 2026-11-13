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
    screen.getByText(
      "여러 언론사 기사를 사건 단위로 묶어 정리한 이슈예요. 마지막 사건이 최근인 이슈부터 보여줘요.",
    ),
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
  expect(requests[0].get("size")).toBe("12");
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
  "모르는 분야나 준비 중 분야(?category=%s)면 맨 앞 탭을 고른다",
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

test("더 보기를 누르면 다음 12개를 아래에 붙이고 붙인 첫 이슈로 포커스를 옮긴다", async () => {
  serveIssues();
  await openPage();

  fireEvent.click(
    await screen.findByRole("button", { name: "이슈 12개 더 보기" }),
  );

  await waitFor(async () => expect(await cardHrefs()).toEqual(ids(100, 24)));
  await waitFor(() =>
    expect(document.activeElement?.getAttribute("href")).toBe("/issues/88"),
  );
  fireEvent.click(screen.getByRole("button", { name: "이슈 6개 더 보기" }));

  await waitFor(async () => expect(await cardHrefs()).toEqual(ids(100, 30)));
  expect(screen.queryByRole("button", { name: /더 보기/ })).toBeNull();
});

test("더 보기 사이에 순서가 바뀌어 같은 이슈가 다시 와도 한 번만 보인다", async () => {
  // 첫 쪽을 받은 뒤 새 사건이 붙은 이슈 101 이 맨 앞으로 와서, 다음 쪽이 하나씩 밀린다
  serveIssues((page) => (page === 0 ? fixture : [issue(101), ...fixture]));
  await openPage();

  fireEvent.click(
    await screen.findByRole("button", { name: "이슈 12개 더 보기" }),
  );

  // 둘째 쪽 첫 이슈는 이미 본 89 다 — 한 번만 남기고 88 부터 붙인다
  await waitFor(async () => expect(await cardHrefs()).toEqual(ids(100, 23)));
});

test("마지막 쪽이면 더 보기를 두지 않는다", async () => {
  serveIssues();
  await openPage("/issues?category=politics");

  await waitFor(async () => expect(await cardHrefs()).toHaveLength(2));
  expect(screen.queryByRole("button", { name: /더 보기/ })).toBeNull();
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
