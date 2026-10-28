import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, onTestFinished, test } from "vitest";
import { server } from "@/mocks/node";
import { stubScreen } from "@/test/media";
import { renderRoute } from "@/test/render";

// 이슈 화면 — 앱과 같은 라우트(src/routes.tsx)로 연다. 12번 이슈는 가짜 사건 8개를 가진다 (src/mocks/handlers.ts)

const title = () =>
  screen.findByRole("heading", { level: 1, name: "한빛반도체 미국 공장 건설" });
const node = (name: RegExp) => screen.findByRole("button", { name });

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
