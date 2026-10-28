import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test, vi } from "vitest";
import { EventPanel } from "@/components/issue/EventPanel";
import { server } from "@/mocks/node";
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
