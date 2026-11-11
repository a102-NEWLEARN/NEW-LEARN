import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test, vi } from "vitest";
import type { ArticleSummary, Page } from "@/api/types";
import { LatestArticles } from "@/components/home/LatestArticles";
import { server } from "@/mocks/node";
import { enterDelay, expectMotionSafe } from "@/test/motion";
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

// A7 을 시험용 기사로 바꾸고, 받은 인자를 남긴다. 쪽마다 기사를 다르게 주려면 함수로 넘긴다
function serveArticles(
  items: ArticleSummary[] | ((page: number) => ArticleSummary[]) = fixture,
) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get("/api/v1/articles", ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push(params);
      const code = params.get("category");
      const page = Number(params.get("page") ?? 0);
      const size = Number(params.get("size") ?? 20);
      const all = typeof items === "function" ? items(page) : items;
      const matched = all.filter(
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
  // 붙은 행은 차례를 처음부터 센다 — 포커스를 받은 첫 행이 늦게 나오지 않게
  expect(enterDelay(added!.closest("li")!)).toBe(0);
  // 남은 기사는 4건
  expect(
    screen.getByRole("button", { name: "기사 4개 더 보기" }),
  ).toBeDefined();
});

// 첫 쪽을 받은 뒤 15분 수집이 맨 앞에 넣는 새 기사 — id 가 클수록 최근이다
const freshArticles = (count: number): ArticleSummary[] =>
  Array.from({ length: count }, (_, at) => {
    const id = 100 + count - at;
    return {
      ...fixture[0],
      id,
      title: `기사 ${id}`,
      publishedAt: `2026-10-31T${String(count - at).padStart(2, "0")}:00:00+09:00`,
      url: `https://news.example.com/a/${id}`,
    };
  });

// React 가 같은 key 를 두 번 만났다는 경고
const sameKeyErrors = (errors: { mock: { calls: unknown[][] } }) =>
  errors.mock.calls.filter((call) => String(call[0]).includes("same key"));

test("더 보기 사이에 새 기사가 앞에 들어와 다음 쪽이 밀려도 같은 기사는 한 번만 보인다", async () => {
  // 새 기사 셋(101 ~ 103)이 맨 앞에 들어와 다음 쪽이 3칸 밀린다 — 95 · 94 · 93 이 다시 온다
  serveArticles((page) =>
    page === 0 ? fixture : [...freshArticles(3), ...fixture],
  );
  const errors = vi.spyOn(console, "error");
  try {
    renderSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "기사 8개 더 보기" }),
    );

    // 100 ~ 93 다음에 밀린 쪽의 새 기사 92 ~ 88 만 붙는다
    await waitFor(async () =>
      expect(await articleHrefs()).toEqual(
        Array.from({ length: 13 }, (_, at) => `/articles/${100 - at}`),
      ),
    );
    const added = screen
      .getAllByRole("link")
      .find((link) => link.getAttribute("href") === "/articles/92");
    await waitFor(() => expect(document.activeElement).toBe(added));
    expect(enterDelay(added!.closest("li")!)).toBe(0);
    // 둘째 쪽을 받을 때 전체 23건, 받은 칸 16 — 다음 쪽은 87 ~ 81 의 7건
    fireEvent.click(screen.getByRole("button", { name: "기사 7개 더 보기" }));

    await waitFor(async () => expect(await articleHrefs()).toHaveLength(20));
    expect(new Set(await articleHrefs()).size).toBe(20);
    // 세 번째 쪽도 그 쪽 첫 행부터 차례를 센다
    const third = screen
      .getAllByRole("link")
      .find((link) => link.getAttribute("href") === "/articles/87");
    expect(enterDelay(third!.closest("li")!)).toBe(0);
    expect(screen.queryByRole("button", { name: /더 보기/ })).toBeNull();
    expect(sameKeyErrors(errors)).toEqual([]);
  } finally {
    errors.mockRestore();
  }
});

test("받은 다음 쪽이 모두 본 기사면 새 기사가 붙을 때까지 다음 쪽을 더 받는다", async () => {
  // 새 기사 여덟이 맨 앞에 들어와 둘째 쪽이 첫 쪽(100 ~ 93)과 똑같아진다
  const requests = serveArticles((page) =>
    page === 0 ? fixture : [...freshArticles(8), ...fixture],
  );
  const errors = vi.spyOn(console, "error");
  try {
    renderSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "기사 8개 더 보기" }),
    );

    // 셋째 쪽의 92 ~ 85 가 붙고 그 첫 기사로 포커스를 옮긴다
    await waitFor(async () =>
      expect(await articleHrefs()).toEqual(
        Array.from({ length: 16 }, (_, at) => `/articles/${100 - at}`),
      ),
    );
    const added = screen
      .getAllByRole("link")
      .find((link) => link.getAttribute("href") === "/articles/92");
    await waitFor(() => expect(document.activeElement).toBe(added));
    expect(enterDelay(added!.closest("li")!)).toBe(0);
    expect(requests.map((params) => params.get("page"))).toEqual([
      "0",
      "1",
      "2",
    ]);
    // 셋째 쪽을 받을 때 전체 28건, 받은 칸 24 — 다음 쪽은 84 ~ 81 의 4건
    expect(
      screen.getByRole("button", { name: "기사 4개 더 보기" }),
    ).toBeDefined();
    expect(sameKeyErrors(errors)).toEqual([]);
  } finally {
    errors.mockRestore();
  }
});

test("더 보기를 누르고 응답 전에 탭을 바꾸면 바뀐 탭은 누르지 않은 다음 쪽을 받지 않는다", async () => {
  const requests = serveArticles();
  // 「전체」의 둘째 쪽만 늦게 답한다. 그 사이에 이미 본 「경제」 탭으로 옮긴다
  let answer: () => void = () => {};
  const answered = new Promise<void>((resolve) => (answer = resolve));
  let waiting = false;
  server.use(
    http.get("/api/v1/articles", async ({ request }) => {
      const params = new URL(request.url).searchParams;
      if (params.get("category") === null && params.get("page") === "1") {
        waiting = true;
        await answered;
      }
      return undefined;
    }),
  );
  renderSection();
  await articleHrefs();
  fireEvent.click(screen.getByRole("tab", { name: "경제" }));
  await waitFor(() => expect(selectedTab()?.textContent).toBe("경제"));
  await articleHrefs();
  fireEvent.click(screen.getByRole("tab", { name: "전체" }));
  await waitFor(() => expect(selectedTab()?.textContent).toBe("전체"));

  fireEvent.click(
    await screen.findByRole("button", { name: "기사 8개 더 보기" }),
  );
  await waitFor(() => expect(waiting).toBe(true));
  fireEvent.click(screen.getByRole("tab", { name: "경제" }));
  await waitFor(() => expect(selectedTab()?.textContent).toBe("경제"));
  answer();
  await new Promise((resolve) => setTimeout(resolve, 300));

  // 경제 탭은 첫 쪽 8건 그대로이고 둘째 쪽을 부르지 않았다
  expect(await articleHrefs()).toHaveLength(8);
  expect(
    requests.filter(
      (params) =>
        params.get("category") === "economy" && params.get("page") !== "0",
    ),
  ).toEqual([]);
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

test("기사 행이 30ms 간격으로 떠오르고, 분야를 바꾸면 목록을 새로 그려 다시 떠오른다", async () => {
  serveArticles();
  renderSection();

  const first = await screen.findByRole("list", { name: "최신 기사" });
  const rows = within(first).getAllByRole("listitem");
  // 프로토타입 v21 ul > li — 380ms, 30ms 간격
  expect(rows[0].getAttribute("class")).toMatch(
    /motion-safe:animate-\[newlearn-rise-in_380ms_/,
  );
  expect(rows.map(enterDelay)).toEqual([0, 30, 60, 90, 120, 150, 180, 210]);
  expectMotionSafe(first);

  fireEvent.click(screen.getByRole("tab", { name: "정치" }));
  await waitFor(async () =>
    expect(await screen.findByRole("list", { name: "최신 기사" })).not.toBe(
      first,
    ),
  );
});

test("홈 최신 기사 행에는 마우스를 올리면 나타나는 「마인드맵 보기」가 있다", async () => {
  serveArticles();
  renderSection();

  const list = await screen.findByRole("list", { name: "최신 기사" });
  await waitFor(() =>
    expect(within(list).getAllByText("마인드맵 보기")).toHaveLength(8),
  );
});
