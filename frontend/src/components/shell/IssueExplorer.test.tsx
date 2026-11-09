import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { useState } from "react";
import { useLocation, useNavigationType } from "react-router";
import { expect, onTestFinished, test, vi } from "vitest";
import type { IssueSummary } from "@/api/issues";
import { IssueExplorer } from "@/components/shell/IssueExplorer";
import { server } from "@/mocks/node";
import { enterDelay } from "@/test/motion";
import { renderWithProviders } from "@/test/render";

// 셸처럼 펼친 분야를 들고 있는 껍데기 (src/components/shell/AppShell.tsx)
function Explorer() {
  const [openCode, setOpenCode] = useState<string | null>(null);
  return <IssueExplorer openCode={openCode} onOpenCodeChange={setOpenCode} />;
}

const category = (name: string) => screen.findByRole("button", { name });

// 이슈 아래 사건 목록. 이름은 「<이슈 제목> 사건」
const eventsOf = (issueTitle: string) =>
  screen.findByRole("list", { name: `${issueTitle} 사건` });

// 사건 날짜는 올해면 「MM.DD」 라서 오늘을 2026-11-03 으로 둔다. Date 만 고정한다
function today() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T12:00:00+09:00"));
  onTestFinished(() => {
    vi.useRealTimers();
  });
}

// 지금 주소와 어떻게 왔는지(PUSH · REPLACE)를 보이는 줄
function Address() {
  const { pathname, search } = useLocation();
  const type = useNavigationType();
  return <output aria-label="주소">{`${type} ${pathname}${search}`}</output>;
}

// A1 분야는 이름 뒤에 이슈 수(issueCount)가 붙는다 (Jira 163)
test("A1 분야 뒤에 준비 중인 분야 두 개를 붙인다", async () => {
  renderWithProviders(<Explorer />);

  await category("정치");
  const names = screen
    .getAllByRole("button")
    .map((button) => button.textContent);
  expect(names).toEqual([
    "정치2",
    "사회2",
    "경제4",
    "국제1",
    "IT·과학2",
    "스포츠준비 중",
    "문화/연예준비 중",
  ]);
});

test("분야를 누르면 그 분야 이슈를 연도별로 보여 준다", async () => {
  renderWithProviders(<Explorer />);

  const economy = await category("경제");
  expect(economy.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(economy);
  expect(economy.getAttribute("aria-expanded")).toBe("true");

  const list = await screen.findByRole("list", { name: "경제 이슈" });
  // 해는 최근부터. 가짜 API 가 맨 앞에 주는 「환율」은 2025년에 시작해서 아래 묶음으로 간다
  const years = within(list)
    .getAllByRole("heading")
    .map((heading) => heading.textContent);
  expect(years).toEqual(["2026", "2025"]);
  // 경제 이슈만, 해 안에서는 API 순서(마지막 사건 최신순) 그대로
  expect(
    within(list)
      .getAllByRole("link")
      .map((link) => link.textContent),
  ).toEqual([
    "기준금리 동결 행진",
    "한빛반도체 미국 공장 건설",
    "원/달러 환율 1,500원 돌파",
    "가계부채 관리 강화",
  ]);
  expect(
    within(list)
      .getByRole("link", { name: "한빛반도체 미국 공장 건설" })
      .getAttribute("href"),
  ).toBe("/issues/12");
});

test("한 번에 한 분야만 열린다", async () => {
  renderWithProviders(<Explorer />);

  fireEvent.click(await category("경제"));
  fireEvent.click(await category("정치"));

  expect((await category("경제")).getAttribute("aria-expanded")).toBe("false");
  expect((await category("정치")).getAttribute("aria-expanded")).toBe("true");
});

test("준비 중인 분야를 누르면 안내한다", async () => {
  renderWithProviders(<Explorer />);

  fireEvent.click(await screen.findByRole("button", { name: /스포츠/ }));

  expect(await screen.findByText("스포츠는 준비 중이에요")).toBeDefined();
});

test("지금 보는 이슈를 표시한다", async () => {
  renderWithProviders(<Explorer />, { route: "/issues/12" });

  fireEvent.click(await category("경제"));

  const current = await screen.findByRole("link", {
    name: "한빛반도체 미국 공장 건설",
  });
  expect(current.getAttribute("aria-current")).toBe("page");
});

test("이슈가 없는 분야는 빈 문구를 보여 준다", async () => {
  server.use(
    http.get("/api/v1/issues", () =>
      HttpResponse.json({
        items: [],
        page: 0,
        size: 50,
        totalElements: 0,
        totalPages: 0,
      }),
    ),
  );
  renderWithProviders(<Explorer />);

  fireEvent.click(await category("국제"));

  expect(await screen.findByText("이 분야의 이슈가 아직 없어요")).toBeDefined();
});

test("이슈를 못 불러오면 그 자리에 다시 시도를 둔다", async () => {
  server.use(
    http.get("/api/v1/issues", () =>
      HttpResponse.json(
        { status: 500, code: "INTERNAL_ERROR" },
        { status: 500 },
      ),
    ),
  );
  renderWithProviders(<Explorer />);

  fireEvent.click(await category("사회"));

  expect(await screen.findByText("이슈를 불러오지 못했어요")).toBeDefined();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeDefined();
});

test("사건이 0개인 이슈(첫 사건 시각이 null)는 이슈를 만든 해로 묶는다", async () => {
  const empty: IssueSummary = {
    id: 77,
    title: "사건 없는 이슈",
    summary: null,
    categories: [{ code: "economy", name: "경제" }],
    eventCount: 0,
    articleCount: 0,
    publisherCount: 0,
    firstEventAt: null,
    lastEventAt: null,
    createdAt: "2025-12-30T10:00:00+09:00",
    lastEvent: null,
    interested: false,
  };
  server.use(
    http.get("/api/v1/issues", () =>
      HttpResponse.json({
        items: [empty],
        page: 0,
        size: 50,
        totalElements: 1,
        totalPages: 1,
      }),
    ),
  );
  renderWithProviders(<Explorer />);

  fireEvent.click(await category("경제"));

  const list = await screen.findByRole("list", { name: "경제 이슈" });
  expect(
    within(list)
      .getAllByRole("heading")
      .map((heading) => heading.textContent),
  ).toEqual(["2025"]);
  expect(
    within(list).getByRole("link", { name: "사건 없는 이슈" }),
  ).toBeDefined();
});

test("보고 있는 이슈 아래에 그 이슈의 사건을 날짜 · 키워드로 펼친다", async () => {
  today();
  renderWithProviders(<Explorer />, { route: "/issues/12" });

  fireEvent.click(await category("경제"));

  const links = within(
    await eventsOf("한빛반도체 미국 공장 건설"),
  ).getAllByRole("link");
  // A4 순서(발생 시각 오름차순) 그대로
  expect(links.map((link) => link.textContent)).toEqual([
    "08.04 후보지 검토",
    "08.21 공식 발표",
    "08.21 세제 혜택",
    "09.02 용수 우려",
    "09.15 보조금 확정",
    "09.15 추가 투자 승인",
    "10.06 착공식",
    "10.09 인력 수급 우려",
  ]);
  expect(links[6].getAttribute("href")).toBe("/issues/12?event=119");
  // 마우스를 올리면 사건 이름 전체가 보인다
  expect(links[6].getAttribute("title")).toBe("한빛반도체 텍사스 공장 착공식");
  // 다른 이슈 아래에는 펼치지 않는다
  expect(
    screen.queryByRole("list", { name: "기준금리 동결 행진 사건" }),
  ).toBeNull();
});

test("이슈 화면이 아니면 사건을 펼치지 않는다", async () => {
  renderWithProviders(<Explorer />, { route: "/home" });

  fireEvent.click(await category("경제"));

  await screen.findByRole("list", { name: "경제 이슈" });
  expect(screen.queryByRole("list", { name: /사건$/ })).toBeNull();
});

test("주소에서 고른 사건을 표시한다", async () => {
  today();
  renderWithProviders(<Explorer />, { route: "/issues/12?event=119" });

  fireEvent.click(await category("경제"));

  const list = await eventsOf("한빛반도체 미국 공장 건설");
  expect(
    within(list)
      .getByRole("link", { name: "10.06 착공식" })
      .getAttribute("aria-current"),
  ).toBe("true");
  expect(
    within(list)
      .getAllByRole("link")
      .filter((link) => link.hasAttribute("aria-current")),
  ).toHaveLength(1);
});

test("사건을 누르면 기록을 쌓지 않고 그 사건 주소로 바꾼다", async () => {
  today();
  renderWithProviders(
    <>
      <Explorer />
      <Address />
    </>,
    { route: "/issues/12" },
  );

  fireEvent.click(await category("경제"));
  fireEvent.click(
    within(await eventsOf("한빛반도체 미국 공장 건설")).getByRole("link", {
      name: "10.06 착공식",
    }),
  );

  expect(screen.getByLabelText("주소").textContent).toBe(
    "REPLACE /issues/12?event=119",
  );
});

test("사건을 못 불러오면 그 자리에 다시 시도를 둔다", async () => {
  server.use(
    http.get("/api/v1/issues/:issueId/timeline", () =>
      HttpResponse.json(
        { status: 500, code: "INTERNAL_ERROR" },
        { status: 500 },
      ),
    ),
  );
  renderWithProviders(<Explorer />, { route: "/issues/12" });

  fireEvent.click(await category("경제"));

  expect(await screen.findByText("사건을 불러오지 못했어요")).toBeDefined();
});

// 이슈 줄 별 (docs/api-screen.md A23 · 프로토타입 v21 PinButton, Jira 172). 가짜 회원은 12 · 21번 이슈를 저장해 두었다
const starOf = (issueTitle: string) =>
  screen.findByRole("button", { name: `${issueTitle} 관심 이슈로 저장` });

test("이슈 줄마다 관심 이슈 별을 두고, 저장한 이슈는 눌린 채다", async () => {
  renderWithProviders(<Explorer />);

  fireEvent.click(await category("경제"));

  expect(
    (await starOf("한빛반도체 미국 공장 건설")).getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    (await starOf("기준금리 동결 행진")).getAttribute("aria-pressed"),
  ).toBe("false");
});

test("별을 누르면 A23 으로 저장하고 받아 둔 목록의 별도 바꾼다", async () => {
  const calls: string[] = [];
  server.use(
    http.put("/api/v1/members/me/interest-issues/:issueId", ({ params }) => {
      calls.push(`PUT ${String(params.issueId)}`);
      return HttpResponse.json({
        issueId: Number(params.issueId),
        interested: true,
        interestedAt: "2026-11-05T10:00:00+09:00",
      });
    }),
  );
  const { queryClient } = renderWithProviders(<Explorer />);
  fireEvent.click(await category("경제"));

  fireEvent.click(await starOf("기준금리 동결 행진"));

  expect(await screen.findByText("관심 이슈로 저장했어요")).toBeDefined();
  expect(calls).toEqual(["PUT 13"]);
  // 가짜 A2 는 저장을 기억하지 않는다 — 다시 받지 않고 받아 둔 응답을 고쳐야 눌린 채로 남는다
  await waitFor(async () =>
    expect(
      (await starOf("기준금리 동결 행진")).getAttribute("aria-pressed"),
    ).toBe("true"),
  );
  const cached = queryClient.getQueriesData<{ items: IssueSummary[] }>({
    queryKey: ["issues"],
  });
  expect(
    cached
      .flatMap(([, page]) => page?.items ?? [])
      .find((item) => item.id === 13)?.interested,
  ).toBe(true);
});

test("저장한 이슈의 별을 누르면 A24 로 뺀다", async () => {
  server.use(
    http.delete("/api/v1/members/me/interest-issues/:issueId", ({ params }) =>
      HttpResponse.json({
        issueId: Number(params.issueId),
        interested: false,
        interestedAt: null,
      }),
    ),
  );
  renderWithProviders(<Explorer />);
  fireEvent.click(await category("경제"));

  fireEvent.click(await starOf("한빛반도체 미국 공장 건설"));

  expect(await screen.findByText("관심 이슈에서 뺐어요")).toBeDefined();
  await waitFor(async () =>
    expect(
      (await starOf("한빛반도체 미국 공장 건설")).getAttribute("aria-pressed"),
    ).toBe("false"),
  );
});

test("분야를 펼치면 그 아래 이슈 행이 30ms 간격으로 떠오른다", async () => {
  renderWithProviders(<Explorer />);

  fireEvent.click(await category("경제"));
  const list = await screen.findByRole("list", { name: "경제 이슈" });
  const rows = within(list)
    .getAllByRole("link")
    .map((link) => link.closest("li")!);
  // 프로토타입 v21 ul > li — 380ms, 30ms 간격. 해 묶음을 건너 차례가 이어진다
  expect(rows[0].getAttribute("class")).toMatch(
    /motion-safe:animate-\[newlearn-rise-in_380ms_/,
  );
  // 행 자체의 움직임은 모두 motion-safe — 행 안 별 버튼의 자리 잡기(-translate-y-1/2)는 움직임이 아니라 따로 본다
  rows.forEach((row) =>
    expect(
      (row.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter((token) => /animate-/.test(token))
        .every((token) => token.startsWith("motion-safe:")),
    ).toBe(true),
  );
  const delays = rows.map(enterDelay);
  expect(delays.slice(0, 3)).toEqual([0, 30, 60]);
  delays
    .slice(1)
    .forEach((at, i) => expect(at).toBeGreaterThanOrEqual(delays[i]));
});
