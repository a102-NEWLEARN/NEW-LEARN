import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import type { ArticleSummary, Page } from "@/api/types";
import { LatestArticles } from "@/components/home/LatestArticles";
import { server } from "@/mocks/node";
import { renderRoute } from "@/test/render";

// 시험용 기사 20건 — 앞 12건은 경제, 뒤 8건은 정치. id 가 클수록 최근이다
const economy = { code: "economy", name: "경제" };
const politics = { code: "politics", name: "정치" };
const fixture: ArticleSummary[] = Array.from({ length: 20 }, (_, at) => ({
  id: 100 - at,
  title: `기사 ${100 - at}`,
  publisher: { code: "garam", name: "가람일보" },
  publishedAt: `2026-10-${String(30 - at).padStart(2, "0")}T09:00:00+09:00`,
  category: at < 12 ? economy : politics,
  summary: null,
  url: `https://news.example.com/a/${100 - at}`,
  mindmapStatus: "SUCCEEDED",
  bookmarked: false,
}));

// A7 을 시험용 기사로 바꾸고, 받은 인자를 남긴다
function serveArticles(items = fixture) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get("/api/v1/articles", ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push(params);
      const code = params.get("category");
      const page = Number(params.get("page") ?? 0);
      const size = Number(params.get("size") ?? 20);
      const matched = items.filter(
        (item) => code === null || item.category?.code === code,
      );
      return HttpResponse.json({
        items: matched.slice(page * size, (page + 1) * size),
        page,
        size,
        totalElements: matched.length,
        totalPages: Math.ceil(matched.length / size),
      } satisfies Page<ArticleSummary>);
    }),
  );
  return requests;
}

function renderSection(path = "/home") {
  return renderRoute(path, [{ path: "/home", element: <LatestArticles /> }]);
}

const selectedTab = () =>
  screen
    .getAllByRole("tab")
    .find((tab) => tab.getAttribute("aria-selected") === "true");

// 기사 행마다 마인드맵 링크 하나와 원문 링크 하나가 있다. 마인드맵 링크만 센다
async function articleHrefs() {
  const list = await screen.findByRole("list", { name: "최신 기사" });
  return within(list)
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"))
    .filter((href) => href?.startsWith("/articles/"));
}

test("제목 · 안내와 「전체」 탭으로 최근 기사 8개를 보인다", async () => {
  const requests = serveArticles();
  renderSection();

  expect(
    screen.getByRole("heading", { level: 2, name: "최신 기사" }),
  ).toBeDefined();
  expect(
    screen.getByText(
      "기사 한 건씩 보여줘요. 누르면 그 기사의 마인드맵이 열려요.",
    ),
  ).toBeDefined();
  expect(
    await screen.findByRole("tablist", { name: "최신 기사 분야" }),
  ).toBeDefined();
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
    "전체",
    "정치",
    "사회",
    "경제",
    "국제",
    "IT·과학",
  ]);
  expect(selectedTab()?.textContent).toBe("전체");
  expect(await articleHrefs()).toEqual(
    [100, 99, 98, 97, 96, 95, 94, 93].map((id) => `/articles/${id}`),
  );
  expect(requests[0].get("category")).toBeNull();
  expect(requests[0].get("page")).toBe("0");
  expect(requests[0].get("size")).toBe("8");
});

test("기사 행에 언론사 · 분야를 적는다", async () => {
  serveArticles();
  renderSection();

  const list = await screen.findByRole("list", { name: "최신 기사" });
  expect(within(list).getAllByText(/가람일보 · .* · 경제/)).toHaveLength(8);
});

test("분야 탭을 고르면 그 분야 기사만 부르고 주소에 남긴다", async () => {
  const requests = serveArticles();
  const { router } = renderSection();

  fireEvent.click(await screen.findByRole("tab", { name: "정치" }));

  await waitFor(() => expect(selectedTab()?.textContent).toBe("정치"));
  expect(router.state.location.search).toBe("?latest=politics");
  expect(await articleHrefs()).toEqual(
    [88, 87, 86, 85, 84, 83, 82, 81].map((id) => `/articles/${id}`),
  );
  expect(requests.at(-1)?.get("category")).toBe("politics");
});

test("「전체」로 돌아오면 주소에서 뺀다", async () => {
  serveArticles();
  const { router } = renderSection("/home?latest=politics&category=economy");

  fireEvent.click(await screen.findByRole("tab", { name: "전체" }));

  await waitFor(() => expect(selectedTab()?.textContent).toBe("전체"));
  // 추천 이슈의 분야는 그대로 둔다
  expect(router.state.location.search).toBe("?category=economy");
});

test("주소의 분야 탭을 골라 연다", async () => {
  serveArticles();
  renderSection("/home?latest=politics");
  await waitFor(() => expect(selectedTab()?.textContent).toBe("정치"));
});

test("모르는 분야 코드면 「전체」를 고른다", async () => {
  const requests = serveArticles();
  renderSection("/home?latest=nope");

  await screen.findByRole("tablist", { name: "최신 기사 분야" });
  expect(selectedTab()?.textContent).toBe("전체");
  await articleHrefs();
  expect(requests.every((params) => params.get("category") === null)).toBe(
    true,
  );
});

test("더 보기를 누르면 다음 8개를 아래에 붙이고 붙인 첫 기사로 포커스를 옮긴다", async () => {
  serveArticles();
  renderSection();

  fireEvent.click(
    await screen.findByRole("button", { name: "기사 8개 더 보기" }),
  );

  await waitFor(async () => expect(await articleHrefs()).toHaveLength(16));
  // 원문 링크가 아니라 마인드맵 링크
  const added = screen
    .getAllByRole("link")
    .find((link) => link.getAttribute("href") === "/articles/92");
  await waitFor(() => expect(document.activeElement).toBe(added));
  // 남은 기사는 4건
  expect(
    screen.getByRole("button", { name: "기사 4개 더 보기" }),
  ).toBeDefined();
});

test("마지막 쪽이면 더 보기를 두지 않는다", async () => {
  serveArticles(fixture.slice(0, 8));
  renderSection();

  expect(await articleHrefs()).toHaveLength(8);
  expect(screen.queryByRole("button", { name: /더 보기/ })).toBeNull();
});

test("기사가 없으면 빈 결과 문구를 둔다", async () => {
  serveArticles([]);
  renderSection();

  expect(await screen.findByText("이 분야의 기사가 아직 없어요")).toBeDefined();
});

test("불러오지 못하면 그 자리에 안내와 다시 시도를 둔다", async () => {
  serveArticles();
  // 나중에 건 것이 먼저 받는다. 실패를 거두면 시험용 기사로 넘긴다
  let fail = true;
  server.use(
    http.get("/api/v1/articles", () =>
      fail ? HttpResponse.json(null, { status: 500 }) : undefined,
    ),
  );
  renderSection();

  expect(
    await screen.findByText("최신 기사를 불러오지 못했어요"),
  ).toBeDefined();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

  expect(await articleHrefs()).toHaveLength(8);
});
