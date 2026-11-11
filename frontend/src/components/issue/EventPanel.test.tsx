import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import type { ArticleSummary, Page } from "@/api/types";
import { EventPanel } from "@/components/issue/EventPanel";
import { server } from "@/mocks/node";
import { enterDelay, expectMotionSafe } from "@/test/motion";
import { renderWithProviders } from "@/test/render";

// 12번 이슈의 가짜 사건 — 119 착공식(기사 5), 117 보조금 확정(기사 6), 120 추정 사건, 116 요약 없음 (src/mocks/handlers.ts)

function renderPanel(eventId: number) {
  const onSelectEvent = vi.fn();
  renderWithProviders(
    <EventPanel eventId={eventId} onSelectEvent={onSelectEvent} />,
  );
  return { onSelectEvent };
}

function problem(path: string, status: number, code: string) {
  return http.get(path, () =>
    HttpResponse.json(
      {
        type: "about:blank",
        title: code,
        status,
        detail: code,
        instance: path,
        code,
      },
      { status },
    ),
  );
}

const relatedList = () => screen.findByRole("list", { name: "관련 기사" });

test("머리에 속한 이슈 · 사건 제목 · 사건 발생 날짜 · 첫 기사 날짜를 보인다", async () => {
  renderPanel(119);

  expect(
    await screen.findByRole("heading", {
      level: 2,
      name: "한빛반도체 텍사스 공장 착공식",
    }),
  ).toBeDefined();
  expect(screen.getByText("한빛반도체 미국 공장 건설")).toBeDefined();
  expect(screen.getByText("사건 발생").parentElement!.textContent).toBe(
    "사건 발생 2026.10.06",
  );
  expect((await screen.findByText("첫 기사")).parentElement!.textContent).toBe(
    "첫 기사 2026.10.06",
  );
});

test("발생 시점을 첫 기사로 채운 사건은 사건 발생 날짜에 「추정」을 붙인다", async () => {
  renderPanel(120);

  expect(
    (await screen.findByText("사건 발생")).parentElement!.textContent,
  ).toBe("사건 발생 2026.10.09 추정");
});

test("요약에는 AI 생성 표시를 붙이고, 요약이 없는 사건은 요약 칸을 두지 않는다", async () => {
  renderPanel(119);
  const summary = await screen.findByRole("region", { name: "요약" });
  expect(within(summary).getByText("AI 생성")).toBeDefined();
  expect(summary.textContent).toContain("공장 착공식을 열고");
});

test("요약이 없는(null) 사건은 요약 칸이 없다", async () => {
  renderPanel(116);

  // 제목 h2 는 불러오는 중에도 먼저 그려진다 — 사건 제목이 올 때까지 기다린다
  await screen.findByRole("heading", {
    level: 2,
    name: "현지 주민 설명회에서 용수 사용 우려 제기",
  });
  expect(screen.queryByRole("region", { name: "요약" })).toBeNull();
});

test("관련 기사를 처음 5건 보이고 기사 수를 머리에 적는다", async () => {
  renderPanel(119);

  const list = await relatedList();
  expect(within(list).getAllByRole("listitem")).toHaveLength(5);
  expect(
    within(screen.getByRole("region", { name: "관련 기사" })).getByText("5"),
  ).toBeDefined();
  expect(screen.queryByRole("button", { name: /더 보기/ })).toBeNull();
});

test("5건이 넘으면 「기사 N개 더 보기」로 다음 쪽을 아래에 붙인다", async () => {
  renderPanel(117);

  const list = await relatedList();
  expect(within(list).getAllByRole("listitem")).toHaveLength(5);
  fireEvent.click(screen.getByRole("button", { name: "기사 1개 더 보기" }));

  await waitFor(() =>
    expect(within(list).getAllByRole("listitem")).toHaveLength(6),
  );
  expect(screen.queryByRole("button", { name: /더 보기/ })).toBeNull();
});

test("관련 기사가 없으면 안내를 둔다", async () => {
  server.use(
    http.get("/api/v1/events/119/articles", () =>
      HttpResponse.json({
        items: [],
        page: 0,
        size: 5,
        totalElements: 0,
        totalPages: 0,
      }),
    ),
  );
  renderPanel(119);

  expect(
    await screen.findByText("아직 이 사건을 다룬 기사가 없어요."),
  ).toBeDefined();
  expect(screen.queryByText("첫 기사")).toBeNull();
});

test("관련 기사를 못 불러오면 그 자리에 안내와 다시 시도를 둔다", async () => {
  server.use(problem("/api/v1/events/119/articles", 500, "INTERNAL_ERROR"));
  renderPanel(119);

  expect(
    await screen.findByText("관련 기사를 불러오지 못했어요"),
  ).toBeDefined();
  server.resetHandlers();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

  expect(within(await relatedList()).getAllByRole("listitem")).toHaveLength(5);
});

test("사건을 못 불러오면 안내와 다시 시도를, 없는 사건이면 찾을 수 없다고 알린다", async () => {
  server.use(problem("/api/v1/events/119", 500, "INTERNAL_ERROR"));
  renderPanel(119);
  expect(await screen.findByText("사건을 불러오지 못했어요")).toBeDefined();
});

test("없는 사건이면 패널 안에 찾을 수 없다고 알린다", async () => {
  renderPanel(999);

  expect(
    await screen.findByRole("heading", {
      level: 2,
      name: "사건을 찾을 수 없어요",
    }),
  ).toBeDefined();
});

test("이전 · 다음 사건 버튼으로 패널을 연 채 사건을 바꾼다", async () => {
  const { onSelectEvent } = renderPanel(119);

  const nav = await screen.findByRole("navigation", {
    name: "이전 · 다음 사건",
  });
  fireEvent.click(
    within(nav).getByRole("button", { name: /이전 사건.*추가 투자 승인/ }),
  );
  fireEvent.click(
    within(nav).getByRole("button", { name: /다음 사건.*인력 수급 우려/ }),
  );

  expect(onSelectEvent.mock.calls).toEqual([[118], [120]]);
});

test("이슈의 첫 사건에는 이전 사건 버튼이 없다", async () => {
  renderPanel(113);

  const nav = await screen.findByRole("navigation", {
    name: "이전 · 다음 사건",
  });
  expect(within(nav).queryByRole("button", { name: /이전 사건/ })).toBeNull();
  expect(within(nav).getByRole("button", { name: /다음 사건/ })).toBeDefined();
});

// ── 리뷰 반영 ─────────────────────────────────────────────

// 이전 · 다음으로 사건을 바꾸는 이슈 화면처럼 — 고른 사건을 들고 있는 자리
function Harness({ start }: { start: number }) {
  const [eventId, setEventId] = useState(start);
  return <EventPanel eventId={eventId} onSelectEvent={setEventId} />;
}

test("이전 · 다음 사건을 눌러도 포커스가 그 버튼 자리에 남는다", async () => {
  renderWithProviders(<Harness start={119} />);
  const next = await screen.findByRole("button", { name: /다음 사건/ });
  act(() => next.focus());

  fireEvent.click(next);

  await screen.findByRole("heading", {
    level: 2,
    name: "텍사스 공장 엔지니어 수급 우려 보도",
  });
  const nav = screen.getByRole("navigation", { name: "이전 · 다음 사건" });
  expect(nav.contains(document.activeElement)).toBe(true);
});

test("사건이 바뀌면 관련 기사도 그 사건 것만 보인다 — 더 보기로 붙인 쪽이 섞이지 않는다", async () => {
  renderWithProviders(<Harness start={117} />);
  const list = await relatedList();
  fireEvent.click(screen.getByRole("button", { name: /더 보기/ }));
  await waitFor(() =>
    expect(within(list).getAllByRole("listitem")).toHaveLength(6),
  );

  fireEvent.click(screen.getByRole("button", { name: /다음 사건/ }));

  await screen.findByRole("heading", {
    level: 2,
    name: "한빛반도체 이사회, 추가 투자 승인",
  });
  await waitFor(() =>
    expect(
      within(screen.getByRole("list", { name: "관련 기사" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(4),
  );
});

test("더 보기로 붙인 첫 기사로 포커스를 옮긴다 — 마지막 쪽이면 버튼이 사라져도 포커스를 잃지 않는다", async () => {
  renderPanel(117);
  const list = await relatedList();
  const more = screen.getByRole("button", { name: /더 보기/ });
  act(() => more.focus());

  fireEvent.click(more);

  await waitFor(() =>
    expect(document.activeElement).toBe(
      within(list).getAllByRole("listitem")[5].querySelector("a"),
    ),
  );
});

// 117번 사건의 기사 6건 — 가짜 A6 를 그대로 받는다
async function articlesOf117() {
  const res = await fetch(
    new URL("/api/v1/events/117/articles?page=0&size=20", location.origin),
  );
  return ((await res.json()) as Page<ArticleSummary>).items;
}

// 119번 사건 관련 기사를 쪽마다 다른 목록으로 준다 — 첫 쪽을 준 뒤 기사가 끼는 모양
function serveShifted(before: ArticleSummary[], after: ArticleSummary[]) {
  server.use(
    http.get("/api/v1/events/119/articles", ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get("page"));
      const all = page === 0 ? before : after;
      return HttpResponse.json({
        items: all.slice(page * 5, (page + 1) * 5),
        page,
        size: 5,
        totalElements: all.length,
        totalPages: Math.ceil(all.length / 5),
      } satisfies Page<ArticleSummary>);
    }),
  );
}

const relatedHrefs = (list: HTMLElement) =>
  within(list)
    .getAllByRole("listitem")
    .map((row) => row.querySelector("a")?.getAttribute("href"));

test("더 보기 사이에 기사가 중간에 끼어 다음 쪽이 밀려도 같은 기사는 한 번만 보인다", async () => {
  // 늦게 분석된 기사(999)가 셋째 자리에 끼어 다음 쪽이 1칸 밀린다 — 첫 쪽의 마지막 기사가 다시 온다
  const before = await articlesOf117();
  serveShifted(before, [
    ...before.slice(0, 2),
    { ...before[0], id: 999, title: "늦게 분석된 기사" },
    ...before.slice(2),
  ]);
  const errors = vi.spyOn(console, "error");
  try {
    renderPanel(119);
    const list = await relatedList();

    fireEvent.click(screen.getByRole("button", { name: "기사 1개 더 보기" }));

    await waitFor(() =>
      expect(relatedHrefs(list)).toEqual(
        before.map(({ id }) => `/articles/${id}`),
      ),
    );
    const rows = within(list).getAllByRole("listitem");
    await waitFor(() =>
      expect(document.activeElement).toBe(rows[5].querySelector("a")),
    );
    // 붙인 쪽은 그 쪽 첫 행부터 차례를 센다
    expect(enterDelay(rows[5])).toBe(enterDelay(rows[0]));
    expect(screen.queryByRole("button", { name: /더 보기/ })).toBeNull();
    expect(
      errors.mock.calls.filter((call) => String(call[0]).includes("same key")),
    ).toEqual([]);
  } finally {
    errors.mockRestore();
  }
});

test("진행 중인 사건 끝에 기사가 붙어도 「기사 N개 더 보기」의 N 은 다음 쪽이 돌려줄 수다", async () => {
  // 첫 쪽을 받을 때 6건이었는데, 다음 쪽 전에 새 기사 다섯이 끝에 붙는다
  const before = await articlesOf117();
  const after = [
    ...before,
    ...[1, 2, 3, 4, 5].map((at) => ({ ...before[5], id: 990 + at })),
  ];
  serveShifted(before, after);
  renderPanel(119);
  const list = await relatedList();

  fireEvent.click(screen.getByRole("button", { name: "기사 1개 더 보기" }));

  // 둘째 쪽(여섯째 ~ 열째)이 붙고, 남은 한 건을 센다 — 첫 쪽 전체(6)로 빼면 -4 였다
  await waitFor(() =>
    expect(within(list).getAllByRole("listitem")).toHaveLength(10),
  );
  expect(
    screen.getByRole("button", { name: "기사 1개 더 보기" }),
  ).toBeDefined();
});

test("「기사 N개 더 보기」의 N 은 한 번에 붙는 수다", async () => {
  server.use(
    http.get("/api/v1/events/119/articles", async ({ request }) => {
      const real = await fetch(request.url.replace("/119/", "/117/"));
      return HttpResponse.json({
        ...(await real.json()),
        totalElements: 12,
        totalPages: 3,
      });
    }),
  );
  renderPanel(119);

  expect(
    await screen.findByRole("button", { name: "기사 5개 더 보기" }),
  ).toBeDefined();
});

test("사건을 못 불러왔을 때 다시 시도하면 다시 불러온다", async () => {
  server.use(problem("/api/v1/events/119", 500, "INTERNAL_ERROR"));
  renderPanel(119);
  await screen.findByText("사건을 불러오지 못했어요");
  server.resetHandlers();

  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

  expect(
    await screen.findByRole("heading", {
      level: 2,
      name: "한빛반도체 텍사스 공장 착공식",
    }),
  ).toBeDefined();
});

// 120 번 사건(A5)만 늦게 온다 — 앞 사건을 보이는 동안의 모습을 본다. 되돌려 주지 않으면 원래 가짜 응답으로 넘어간다
function slowEvent(eventId: number) {
  server.use(
    http.get(`/api/v1/events/${eventId}`, async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }),
  );
}

test("이전 · 다음으로 새 사건을 받는 동안에는 앞 사건 제목 아래에 새 사건의 기사 · 첫 기사를 섞어 보이지 않는다", async () => {
  slowEvent(120);
  renderWithProviders(<Harness start={119} />);
  await relatedList();

  fireEvent.click(screen.getByRole("button", { name: /다음 사건/ }));
  // A6(120) 가 먼저 와도 기다리는 동안은 관련 기사 · 첫 기사를 그리지 않는다
  await new Promise((resolve) => setTimeout(resolve, 100));

  expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
    "한빛반도체 텍사스 공장 착공식",
  );
  expect(screen.queryByRole("list", { name: "관련 기사" })).toBeNull();
  expect(screen.queryByText("첫 기사")).toBeNull();

  await screen.findByRole("heading", {
    level: 2,
    name: "텍사스 공장 엔지니어 수급 우려 보도",
  });
  await waitFor(() =>
    expect(
      within(screen.getByRole("list", { name: "관련 기사" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(4),
  );
});

test("새 사건을 받는 동안 다른 곳으로 옮긴 포커스는 빼앗지 않는다", async () => {
  slowEvent(120);
  renderWithProviders(
    <>
      <Harness start={119} />
      <button type="button">바깥</button>
    </>,
  );
  const next = await screen.findByRole("button", { name: /다음 사건/ });
  act(() => next.focus());
  fireEvent.click(next);
  const outside = screen.getByRole("button", { name: "바깥" });
  act(() => outside.focus());

  await screen.findByRole("heading", {
    level: 2,
    name: "텍사스 공장 엔지니어 수급 우려 보도",
  });

  expect(document.activeElement).toBe(outside);
});

test("사건을 열면 제목 → 날짜 → 요약 → 관련 기사 차례로 떠오르고, 관련 기사는 한 줄씩 떠오른다", async () => {
  renderPanel(119);
  const heading = await screen.findByRole("heading", {
    level: 2,
    name: "한빛반도체 텍사스 공장 착공식",
  });
  await relatedList();

  const order = [
    heading.firstElementChild!,
    screen.getByText("사건 발생").closest('[class*="motion-safe:animate-"]')!,
    screen.getByRole("region", { name: "요약" }),
    screen.getByRole("region", { name: "관련 기사" }),
  ].map(enterDelay);
  expect(order.some(Number.isNaN)).toBe(false);
  order.slice(1).forEach((at, i) => expect(at).toBeGreaterThan(order[i]));
  const rows = within(await relatedList()).getAllByRole("listitem");
  expect(enterDelay(rows[1])).toBeGreaterThan(enterDelay(rows[0]));
  expectMotionSafe();
});

test("이전 · 다음으로 사건을 바꾸면 새 사건 제목이 다시 떠오른다", async () => {
  function Stepper() {
    const [eventId, setEventId] = useState(119);
    return <EventPanel eventId={eventId} onSelectEvent={setEventId} />;
  }
  renderWithProviders(<Stepper />);
  const first = (
    await screen.findByRole("heading", {
      level: 2,
      name: "한빛반도체 텍사스 공장 착공식",
    })
  ).firstElementChild;

  fireEvent.click(await screen.findByRole("button", { name: /이전 사건/ }));
  await waitFor(() =>
    expect(screen.getByRole("heading", { level: 2 }).textContent).not.toBe(
      "한빛반도체 텍사스 공장 착공식",
    ),
  );
  const heading = screen.getByRole("heading", { level: 2 });

  // 새로 그린 제목이다 — 같은 요소를 글만 바꾸면 애니메이션이 다시 돌지 않는다
  expect(heading.firstElementChild).not.toBe(first);
  expect(heading.firstElementChild!.getAttribute("class")).toMatch(
    /motion-safe:animate-\[newlearn-/,
  );
});

// 운영에서 사건을 바꿀 때마다 이슈 제목 줄이 하나씩 쌓였다 — 같은 부모 안 형제가 같은 key 를 써서 앞 요소가 안 지워졌다 (Jira 188)
test("사건을 오가도 이슈 제목 · 요약 칸은 하나씩만 있다", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  renderWithProviders(<Harness start={119} />);
  await screen.findByRole("heading", {
    level: 2,
    name: "한빛반도체 텍사스 공장 착공식",
  });

  // 이미 받은 사건으로 돌아올 때 앞 사건의 요소가 남았다 — 「이전 → 다음」으로 오간다
  fireEvent.click(await screen.findByRole("button", { name: /이전 사건/ }));
  await waitFor(() =>
    expect(screen.getByRole("heading", { level: 2 }).textContent).not.toBe(
      "한빛반도체 텍사스 공장 착공식",
    ),
  );
  fireEvent.click(await screen.findByRole("button", { name: /다음 사건/ }));
  await screen.findByRole("heading", {
    level: 2,
    name: "한빛반도체 텍사스 공장 착공식",
  });
  await relatedList();

  expect(screen.getAllByText("한빛반도체 미국 공장 건설")).toHaveLength(1);
  expect(screen.getAllByRole("region", { name: "요약" })).toHaveLength(1);
  const sameKey = errors.mock.calls.filter((call) =>
    call.some((part) => String(part).includes("same key")),
  );
  expect(sameKey).toHaveLength(0);
  errors.mockRestore();
});
