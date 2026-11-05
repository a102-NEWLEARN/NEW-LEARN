import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, onTestFinished, test, vi } from "vitest";
import { server } from "@/mocks/node";
import { resizeScreen, stubScreen } from "@/test/media";
import { renderRoute } from "@/test/render";

// 이슈 화면 — 앱과 같은 라우트(src/routes.tsx)로 연다. 12번 이슈는 가짜 사건 8개를 가진다 (src/mocks/handlers.ts)

const title = () =>
  screen.findByRole("heading", { level: 1, name: "한빛반도체 미국 공장 건설" });
// 타임라인의 사건 노드. 사건 패널의 기사 행 북마크 버튼도 이름에 사건 이름이 든 기사 제목을 달고 있어서 타임라인 안에서 찾는다
const node = async (name: RegExp) =>
  within(
    await screen.findByRole("group", { name: "사건 타임라인" }),
  ).findByRole("button", { name });

function serverError(path: string) {
  return http.get(path, () =>
    HttpResponse.json(
      {
        type: "about:blank",
        title: "Internal Server Error",
        status: 500,
        detail: "서버 오류",
        instance: path,
        code: "INTERNAL_ERROR",
      },
      { status: 500 },
    ),
  );
}

test("헤더에 분야 · 연도 · 제목 · 요약, 도구줄에 기간 · 사건 · 기사 수를 보인다", async () => {
  renderRoute("/issues/12");

  const header = (await title()).closest("header")!;
  expect(within(header).getByText("경제 · 2026")).toBeDefined();
  expect(
    within(header).getByText("한빛반도체가 텍사스 공장 투자를 늘리고 착공했다"),
  ).toBeDefined();
  expect(
    await screen.findByText("2026.08.04 ~ 10.09 · 사건 8 · 기사 31"),
  ).toBeDefined();
});

test("탭 제목을 이슈 제목으로 바꾼다", async () => {
  renderRoute("/issues/12");

  await title();
  await waitFor(() =>
    expect(document.title).toBe("한빛반도체 미국 공장 건설 | NEW:LEARN"),
  );
});

test("사건 노드를 누르면 기록을 쌓지 않고 ?event= 로 그 사건을 고른다", async () => {
  const { router } = renderRoute("/issues/12");

  fireEvent.click(await node(/착공식/));

  expect(router.state.location.search).toBe("?event=119");
  expect(router.state.historyAction).toBe("REPLACE");
  expect((await node(/착공식/)).getAttribute("aria-current")).toBe("true");
});

test("?event= 로 열면 그 사건을 고른 채 열고, 빈 곳을 누르면 고르기를 푼다", async () => {
  const { router } = renderRoute("/issues/12?event=117");

  expect((await node(/보조금 지급 확정/)).getAttribute("aria-current")).toBe(
    "true",
  );

  fireEvent.click(screen.getByRole("group", { name: "사건 타임라인" }));

  expect(router.state.location.search).toBe("");
  expect(router.state.historyAction).toBe("REPLACE");
});

test("사건이 없는 이슈는 타임라인 자리에 안내를 둔다", async () => {
  server.use(
    http.get("/api/v1/issues/12/timeline", () =>
      HttpResponse.json({ issueId: 12, events: [] }),
    ),
  );
  renderRoute("/issues/12");

  expect(
    await screen.findByText("아직 이 이슈에 정리된 사건이 없어요"),
  ).toBeDefined();
  expect(screen.queryByRole("group", { name: "사건 타임라인" })).toBeNull();
});

test("타임라인을 못 불러오면 그 자리에 안내와 다시 시도를 두고, 헤더는 그대로 보인다", async () => {
  server.use(serverError("/api/v1/issues/12/timeline"));
  renderRoute("/issues/12");

  expect(await screen.findByText("타임라인을 불러오지 못했어요")).toBeDefined();
  expect(await title()).toBeDefined();

  server.resetHandlers();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

  expect(await node(/착공식/)).toBeDefined();
});

test("이슈 헤더를 못 불러오면 제목 자리에 안내와 다시 시도를 둔다", async () => {
  server.use(serverError("/api/v1/issues/12"));
  renderRoute("/issues/12");

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "이슈를 불러오지 못했어요",
    }),
  ).toBeDefined();
  server.resetHandlers();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

  expect(await title()).toBeDefined();
});

test.each(["/issues/999", "/issues/abc", "/issues/12.5"])(
  "%s 처럼 없는 이슈는 찾을 수 없음 화면을 띄운다",
  async (path) => {
    renderRoute(path);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "이슈를 찾을 수 없어요",
      }),
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "홈으로" })).toBeDefined();
    await waitFor(() =>
      expect(document.title).toBe("이슈를 찾을 수 없어요 | NEW:LEARN"),
    );
  },
);

// 404 는 응답이 온 뒤에야 알아서 이슈 제목 자리를 찾을 수 없음 화면으로 바꾼다. 포커스가 사라지지 않고 새 제목으로 가야 한다
test("다른 화면에서 없는 이슈로 오면 포커스가 찾을 수 없음 제목으로 간다", async () => {
  const { router } = renderRoute("/home");
  await screen.findByRole("heading", {
    level: 1,
    name: "오늘의 이슈를 탐색해 보세요",
  });

  await act(() => router.navigate("/issues/999"));

  const heading = await screen.findByRole("heading", {
    level: 1,
    name: "이슈를 찾을 수 없어요",
  });
  await waitFor(() => expect(document.activeElement).toBe(heading));
});

test("다른 화면에서 이슈 화면으로 오면 포커스를 이슈 제목(h1)으로 옮긴다", async () => {
  const { router } = renderRoute("/home");
  await screen.findByRole("heading", {
    level: 1,
    name: "오늘의 이슈를 탐색해 보세요",
  });

  await act(() => router.navigate("/issues/12"));

  const heading = await title();
  expect(document.activeElement).toBe(heading);
});

function notFound(path: string) {
  return http.get(path, () =>
    HttpResponse.json(
      {
        type: "about:blank",
        title: "Not Found",
        status: 404,
        detail: "이슈를 찾을 수 없다",
        instance: path,
        code: "ISSUE_NOT_FOUND",
      },
      { status: 404 },
    ),
  );
}

test.each(["/api/v1/issues/12", "/api/v1/issues/12/timeline"])(
  "%s 하나만 404 여도 찾을 수 없음 화면을 띄운다",
  async (path) => {
    server.use(notFound(path));
    renderRoute("/issues/12");

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "이슈를 찾을 수 없어요",
      }),
    ).toBeDefined();
  },
);

test.each(["99999999999999999999", "9007199254740993"])(
  "자바스크립트 숫자로 틀림없이 옮길 수 없는 id(%s)는 서버에 묻지 않고 찾을 수 없음이다",
  async (id) => {
    const asked: string[] = [];
    const count = ({ request }: { request: Request }) => {
      const { pathname } = new URL(request.url);
      if (pathname.startsWith("/api/v1/issues/")) asked.push(pathname);
    };
    server.events.on("request:start", count);
    onTestFinished(() => {
      server.events.removeListener("request:start", count);
    });
    renderRoute(`/issues/${id}`);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "이슈를 찾을 수 없어요",
      }),
    ).toBeDefined();
    expect(asked).toEqual([]);
  },
);

test("도구줄 개수가 0이면 그 항목을 뺀다", async () => {
  server.use(
    http.get("/api/v1/issues/12", async ({ request }) => {
      const real = await fetch(request.url.replace("/12", "/13"));
      return HttpResponse.json({
        ...(await real.json()),
        id: 12,
        articleCount: 0,
      });
    }),
  );
  renderRoute("/issues/12");

  expect(await screen.findByText(/· 사건 4$/)).toBeDefined();
  expect(screen.queryByText(/기사 0/)).toBeNull();
});

// Esc 는 맨 위에 열린 것 하나만 닫는다 (EXPERIENCE.md Interaction Primitives) — 서랍 안에서 누른 Esc 는 서랍만
test("좁은 화면에서 TIP 을 연 채 서랍을 열고 Esc 를 누르면 서랍만 닫힌다", async () => {
  stubScreen("narrow");
  renderRoute("/issues/12");
  fireEvent.click(await screen.findByRole("button", { name: "TIP" }));
  fireEvent.click(await screen.findByRole("button", { name: "메뉴 열기" }));
  const drawer = await screen.findByRole("dialog", { name: "메뉴" });

  fireEvent.keyDown(drawer, { key: "Escape" });

  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "메뉴" })).toBeNull(),
  );
  expect(screen.getByRole("dialog", { name: "타임라인 TIP" })).toBeDefined();
});

test("넓은 화면에서 TIP 만 열려 있으면 타임라인 밖(이슈 제목)에서 누른 Esc 도 TIP 을 닫는다", async () => {
  renderRoute("/issues/12");
  fireEvent.click(await screen.findByRole("button", { name: "TIP" }));
  const heading = await title();

  fireEvent.keyDown(heading, { key: "Escape" });

  expect(screen.queryByRole("dialog", { name: "타임라인 TIP" })).toBeNull();
});

// ── 사건 패널 (S15P31A102-52) ──────────────────────────────

const panel = () => screen.findByRole("complementary", { name: "사건 상세" });
const panelTitle = (name: string) =>
  screen.findByRole("heading", { level: 2, name });

test("사건 노드를 누르면 오른쪽에 사건 패널이 열리고 포커스가 패널 제목으로 간다", async () => {
  renderRoute("/issues/12");

  fireEvent.click(await node(/착공식/));

  const aside = await panel();
  const heading = await within(aside).findByRole("heading", {
    level: 2,
    name: "한빛반도체 텍사스 공장 착공식",
  });
  await waitFor(() => expect(document.activeElement).toBe(heading));
});

test("X 로 닫으면 기록을 쌓지 않고 ?event= 를 지우고 포커스를 그 사건 노드로 돌린다", async () => {
  const { router } = renderRoute("/issues/12");
  fireEvent.click(await node(/착공식/));
  await panelTitle("한빛반도체 텍사스 공장 착공식");

  fireEvent.click(screen.getByRole("button", { name: "상세 패널 닫기" }));

  expect(router.state.location.search).toBe("");
  expect(router.state.historyAction).toBe("REPLACE");
  expect(screen.queryByRole("complementary", { name: "사건 상세" })).toBeNull();
  expect(document.activeElement).toBe(await node(/착공식/));
});

test("Esc 로 패널을 닫는다 — TIP 이 열려 있으면 TIP 을 먼저 닫는다", async () => {
  const { router } = renderRoute("/issues/12?event=119");
  await panelTitle("한빛반도체 텍사스 공장 착공식");
  fireEvent.click(screen.getByRole("button", { name: "TIP" }));

  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "타임라인 TIP" })).toBeNull();
  expect(router.state.location.search).toBe("?event=119");

  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(router.state.location.search).toBe("");
});

test("이전 · 다음 사건으로 패널을 연 채 기록을 쌓지 않고 사건만 바꾼다", async () => {
  const { router } = renderRoute("/issues/12?event=119");
  await panelTitle("한빛반도체 텍사스 공장 착공식");

  fireEvent.click(screen.getByRole("button", { name: /다음 사건/ }));

  expect(router.state.location.search).toBe("?event=120");
  expect(router.state.historyAction).toBe("REPLACE");
  expect(await panelTitle("텍사스 공장 엔지니어 수급 우려 보도")).toBeDefined();
});

test("주소의 사건이 다른 이슈의 사건이면 그 이슈 주소로 바꾼다", async () => {
  const { router } = renderRoute("/issues/13?event=119");

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/issues/12"),
  );
  expect(router.state.location.search).toBe("?event=119");
  expect(router.state.historyAction).toBe("REPLACE");
});

test("사건 패널이 열리면 사이드바를 접는다", async () => {
  renderRoute("/issues/12");
  fireEvent.click(
    await screen.findByRole("button", { name: "사이드바 펼치기" }),
  );
  expect(screen.getByRole("button", { name: "사이드바 접기" })).toBeDefined();

  fireEvent.click(await node(/착공식/));

  expect(
    await screen.findByRole("button", { name: "사이드바 펼치기" }),
  ).toBeDefined();
});

test("좁은 화면에서는 사건 패널을 아래에서 올라오는 시트로 연다", async () => {
  stubScreen("narrow");
  renderRoute("/issues/12?event=119");

  const sheet = await screen.findByRole("dialog", { name: "사건 상세" });
  expect(
    await within(sheet).findByRole("heading", {
      level: 2,
      name: "한빛반도체 텍사스 공장 착공식",
    }),
  ).toBeDefined();
  expect(screen.queryByRole("complementary", { name: "사건 상세" })).toBeNull();
});

// TIP 창 밖(노드)에 포커스가 있을 때 — 같은 Esc 하나가 TIP 과 패널을 함께 닫지 않는다
test("TIP 과 패널이 함께 열린 채 노드에서 Esc 를 누르면 TIP 만 닫는다", async () => {
  const { router } = renderRoute("/issues/12?event=119");
  await panelTitle("한빛반도체 텍사스 공장 착공식");
  fireEvent.click(screen.getByRole("button", { name: "TIP" }));
  const target = await node(/공식 발표/);
  act(() => target.focus());

  fireEvent.keyDown(target, { key: "Escape" });

  expect(screen.queryByRole("dialog", { name: "타임라인 TIP" })).toBeNull();
  expect(router.state.location.search).toBe("?event=119");
});

// ── 사건 패널 리뷰 반영 ───────────────────────────────────

test("주소로 사건 패널을 처음 열 때는 포커스를 옮기지 않는다", async () => {
  renderRoute("/issues/12?event=119");

  await panelTitle("한빛반도체 텍사스 공장 착공식");
  expect(document.activeElement).toBe(document.body);
});

test("Esc 로 닫으면 포커스를 그 사건 노드로 돌린다", async () => {
  renderRoute("/issues/12");
  fireEvent.click(await node(/착공식/));
  await panelTitle("한빛반도체 텍사스 공장 착공식");

  fireEvent.keyDown(document.activeElement!, { key: "Escape" });

  expect(document.activeElement).toBe(await node(/착공식/));
});

test("닫을 사건 노드가 타임라인에 없으면 포커스를 이슈 제목으로 돌린다", async () => {
  renderRoute("/issues/12?event=999");
  await panelTitle("사건을 찾을 수 없어요");

  fireEvent.click(screen.getByRole("button", { name: "상세 패널 닫기" }));

  expect(document.activeElement).toBe(await title());
});

test("패널을 연 채 사이드바를 펼친 뒤 다음 사건으로 가도 사이드바를 다시 접지 않는다", async () => {
  renderRoute("/issues/12?event=119");
  await panelTitle("한빛반도체 텍사스 공장 착공식");
  fireEvent.click(screen.getByRole("button", { name: "사이드바 펼치기" }));

  fireEvent.click(screen.getByRole("button", { name: /다음 사건/ }));
  await panelTitle("텍사스 공장 엔지니어 수급 우려 보도");

  expect(screen.getByRole("button", { name: "사이드바 접기" })).toBeDefined();
});

test("좁은 화면 시트를 닫기 버튼으로 닫으면 기록을 쌓지 않고 ?event= 를 지운다", async () => {
  stubScreen("narrow");
  const { router } = renderRoute("/issues/12?event=119");
  const sheet = await screen.findByRole("dialog", { name: "사건 상세" });

  fireEvent.click(
    within(sheet).getByRole("button", { name: "상세 패널 닫기" }),
  );

  await waitFor(() => expect(router.state.location.search).toBe(""));
  expect(router.state.historyAction).toBe("REPLACE");
});

test("패널이 닫혀 있을 때 타임라인 빈 곳을 누르면 포커스를 옮기지 않는다", async () => {
  renderRoute("/issues/12");
  await node(/착공식/);

  fireEvent.click(screen.getByRole("group", { name: "사건 타임라인" }));

  expect(document.activeElement).toBe(document.body);
});

// 용어사전 버튼은 셸이 오른쪽 아래에 띄운다. 넓은 화면의 사건 패널이 열리면 패널의 실제 폭만큼 비킨다
// (EXPERIENCE.md 앱 셸 「용어사전 버튼」). jsdom 은 폭을 0 으로 재서 사건 패널만 420 으로 준다
const dictionaryButton = () =>
  screen.getByRole("button", { name: "용어 사전 열기" });

function measurePanel(width: number) {
  const spy = vi
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockImplementation(function (this: HTMLElement) {
      return this.getAttribute("aria-label") === "사건 상세" ? width : 0;
    });
  onTestFinished(() => spy.mockRestore());
}

test("넓은 화면에서 사건 패널이 열리면 용어사전 버튼이 패널 폭만큼 비키고, 닫으면 돌아온다", async () => {
  measurePanel(420);
  renderRoute("/issues/12");
  await node(/착공식/);
  expect(dictionaryButton().style.right).toBe("24px");

  fireEvent.click(await node(/착공식/));
  await panelTitle("한빛반도체 텍사스 공장 착공식");
  expect(dictionaryButton().style.right).toBe("444px");

  fireEvent.click(screen.getByRole("button", { name: "상세 패널 닫기" }));
  expect(dictionaryButton().style.right).toBe("24px");
});

test("패널이 줄어든 폭(max-w 50%)도 잰 대로 비킨다", async () => {
  measurePanel(380);
  renderRoute("/issues/12?event=119");
  await panelTitle("한빛반도체 텍사스 공장 착공식");

  expect(dictionaryButton().style.right).toBe("404px");
});

test("사건 패널을 연 채 다른 화면으로 가면 용어사전 버튼이 제자리로 돌아온다", async () => {
  measurePanel(420);
  const { router } = renderRoute("/issues/12?event=119");
  await panelTitle("한빛반도체 텍사스 공장 착공식");
  expect(dictionaryButton().style.right).toBe("444px");

  await act(() => router.navigate("/home"));

  expect(dictionaryButton().style.right).toBe("24px");
});

test("좁은 화면에서는 사건 시트가 올라와도 용어사전 버튼이 비키지 않는다 — 오른쪽 16px (모바일 v1)", async () => {
  stubScreen("narrow");
  measurePanel(420);
  renderRoute("/issues/12?event=119");
  await screen.findByRole("dialog", { name: "사건 상세" });

  // 시트는 모달이라 뒤를 aria-hidden 으로 가린다 — 역할로는 못 찾아 속성으로 찾는다
  const button = document.querySelector<HTMLElement>(
    'button[aria-label="용어 사전 열기"]',
  );
  expect(button?.style.right).toBe("16px");
});

test("좁은 화면 사건 시트는 본문(main) 밖에 그려 딤이 용어사전 버튼까지 덮는다", async () => {
  stubScreen("narrow");
  renderRoute("/issues/12?event=119");

  const sheet = await screen.findByRole("dialog", { name: "사건 상세" });
  // 본문은 isolate 라 그 안의 z-index 는 본문 밖에 떠 있는 용어사전 버튼을 넘지 못한다
  expect(document.querySelector("main")?.contains(sheet)).toBe(false);
});

test("좁은 화면에서 넓은 화면으로 바뀌면 그때 나타난 패널 폭만큼 비킨다", async () => {
  stubScreen("narrow");
  measurePanel(420);
  renderRoute("/issues/12?event=119");
  await screen.findByRole("dialog", { name: "사건 상세" });
  // 시트가 사라지는 동안 뒤가 aria-hidden 일 수 있어 속성으로 찾는다
  const right = () =>
    document.querySelector<HTMLElement>('button[aria-label="용어 사전 열기"]')
      ?.style.right;

  act(() => resizeScreen("wide"));
  await panel();
  expect(right()).toBe("444px");

  act(() => resizeScreen("narrow"));
  await screen.findByRole("dialog", { name: "사건 상세" });
  // 좁은 화면 버튼 자리 — 모바일 v1
  expect(right()).toBe("16px");

  act(() => resizeScreen("wide"));
  await panel();
  expect(right()).toBe("444px");
});

test("용어사전 창과 사건 패널이 같이 열려 있으면 Esc 는 창부터 닫는다", async () => {
  const { router } = renderRoute("/issues/12?event=119");
  await panelTitle("한빛반도체 텍사스 공장 착공식");
  fireEvent.click(dictionaryButton());

  fireEvent.keyDown(screen.getByRole("textbox", { name: "용어 입력" }), {
    key: "Escape",
  });
  expect(screen.queryByRole("dialog", { name: "용어 사전" })).toBeNull();
  expect(router.state.location.search).toBe("?event=119");

  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(router.state.location.search).toBe("");
});

test("사이드바에서 사건을 누르면 패널이 열리고 포커스가 패널 제목으로 간다", async () => {
  renderRoute("/issues/12");
  fireEvent.click(
    await screen.findByRole("button", { name: "사이드바 펼치기" }),
  );
  const sidebar = screen.getByRole("navigation", { name: "사이드바" });
  fireEvent.click(await within(sidebar).findByRole("button", { name: "경제" }));

  // 사이드바의 사건 링크는 「날짜 키워드」다. 패널이 열리면 사이드바가 접혀 링크가 사라진다
  fireEvent.click(await within(sidebar).findByRole("link", { name: /착공식/ }));

  const heading = await within(await panel()).findByRole("heading", {
    level: 2,
    name: "한빛반도체 텍사스 공장 착공식",
  });
  await waitFor(() => expect(document.activeElement).toBe(heading));
});

test("좁은 화면에서는 이슈 흐름을 세로 타임라인으로 둔다 — 넓은 화면은 가로 지도다", async () => {
  stubScreen("narrow");
  renderRoute("/issues/12");

  expect(
    await screen.findByRole("heading", { level: 3, name: "2026년 8월" }),
  ).toBeDefined();
  expect(await node(/착공식/)).toBeDefined();
  expect(document.querySelector('svg[aria-label="사건 타임라인"]')).toBeNull();
});

test("넓은 화면은 가로 지도다", async () => {
  renderRoute("/issues/12");

  await node(/착공식/);
  expect(
    document.querySelector('svg[aria-label="사건 타임라인"]'),
  ).not.toBeNull();
  expect(
    screen.queryByRole("heading", { level: 3, name: "2026년 8월" }),
  ).toBeNull();
});
