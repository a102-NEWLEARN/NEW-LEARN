import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import type { MindmapStatus } from "@/api/types";
import { server } from "@/mocks/node";
import { renderRoute } from "@/test/render";

// 앱과 같은 라우트로 연다 — 셸 · 손님 가드까지 함께 본다.
// 11901 은 119번 사건(한빛반도체 텍사스 공장 착공식)의 첫 기사다 (src/mocks/handlers.ts)
const PATH = "/articles/11901";

function problem(status: number, code: string, instance: string) {
  return HttpResponse.json(
    { type: "about:blank", title: code, status, detail: code, instance, code },
    { status },
  );
}

// A9 가 결과 없음(404 MINDMAP_NOT_FOUND)이고 A8 의 마인드맵 상태가 이것이다
function noMindmap(mindmapStatus: MindmapStatus) {
  server.use(
    http.get("/api/v1/articles/11901/mindmap", ({ request }) =>
      problem(404, "MINDMAP_NOT_FOUND", new URL(request.url).pathname),
    ),
    http.get("/api/v1/articles/11901", async ({ request }) => {
      const real = await fetch(request.url.replace("11901", "11902"));
      return HttpResponse.json({
        ...(await real.json()),
        id: 11901,
        mindmapStatus,
      });
    }),
  );
}

// A9 응답을 바꾼다
function mindmapWith(change: object) {
  server.use(
    http.get("/api/v1/articles/11901/mindmap", async ({ request }) => {
      const real = await fetch(request.url.replace("11901", "11902"));
      return HttpResponse.json({ ...(await real.json()), ...change });
    }),
  );
}

const heading = () =>
  screen.findByRole("heading", {
    level: 1,
    name: "한빛반도체 텍사스 공장 착공식",
  });
const tab = (name: string) => screen.getByRole("tab", { name });

test("셸 안에 기사 헤더와 마인드맵 보기를 띄우고 탭 제목을 기사 제목으로 바꾼다", async () => {
  renderRoute(PATH);

  expect(await heading()).toBeDefined();
  expect(screen.getByRole("navigation", { name: "사이드바" })).toBeDefined();
  expect(
    await screen.findByRole("group", { name: "기사 마인드맵" }),
  ).toBeDefined();
  expect(tab("마인드맵").getAttribute("aria-selected")).toBe("true");
  expect(screen.getByText("AI 생성")).toBeDefined();
  await waitFor(() =>
    expect(document.title).toBe("한빛반도체 텍사스 공장 착공식 | NEW:LEARN"),
  );
});

test("흐름지도 탭을 고르면 주소에 ?view=flow 를 남기고 기록은 쌓지 않는다", async () => {
  const { router } = renderRoute(PATH);
  await screen.findByRole("group", { name: "기사 마인드맵" });

  fireEvent.click(tab("흐름지도"));

  await waitFor(() => expect(router.state.location.search).toBe("?view=flow"));
  expect(router.state.historyAction).toBe("REPLACE");
  expect(
    await screen.findByText("흐름지도 보기는 준비 중이에요"),
  ).toBeDefined();
  expect(screen.queryByRole("group", { name: "기사 마인드맵" })).toBeNull();

  fireEvent.click(tab("마인드맵"));
  await waitFor(() => expect(router.state.location.search).toBe("?view=map"));
  expect(
    await screen.findByRole("group", { name: "기사 마인드맵" }),
  ).toBeDefined();
});

test("주소의 ?view=flow 로 열면 흐름지도 탭이 골라져 있다", async () => {
  renderRoute(`${PATH}?view=flow`);

  await heading();
  expect(tab("흐름지도").getAttribute("aria-selected")).toBe("true");
});

test.each([
  ["QUEUED", "기사를 분석하고 있어요"],
  ["NONE", "이 기사의 마인드맵이 아직 없어요"],
  ["FAILED", "이 기사의 마인드맵이 아직 없어요"],
  ["NOT_ANALYZABLE", "이 기사의 마인드맵이 아직 없어요"],
] as const)(
  "마인드맵 결과가 없고 분석 상태가 %s 면 「%s」",
  async (status, message) => {
    noMindmap(status);
    renderRoute(PATH);

    expect(await screen.findByText(message)).toBeDefined();
    expect(screen.queryByRole("group", { name: "기사 마인드맵" })).toBeNull();
  },
);

test("모르는 판의 마인드맵은 그리지 않고 안내한다", async () => {
  mindmapWith({ schemaVersion: "mindmap-v9" });
  renderRoute(PATH);

  expect(
    await screen.findByText("이 마인드맵은 지금 보여 드릴 수 없어요"),
  ).toBeDefined();
  expect(screen.queryByRole("group", { name: "기사 마인드맵" })).toBeNull();
});

test("가지가 하나도 없으면 안내한다", async () => {
  mindmapWith({ branches: [] });
  renderRoute(PATH);

  expect(
    await screen.findByText("이 기사에서 정리한 내용이 없어요"),
  ).toBeDefined();
});

test("마인드맵을 불러오지 못하면 그 자리에 안내와 다시 시도를 둔다", async () => {
  let calls = 0;
  server.use(
    http.get("/api/v1/articles/11901/mindmap", async ({ request }) => {
      calls += 1;
      if (calls === 1)
        return problem(500, "INTERNAL_ERROR", new URL(request.url).pathname);
      const real = await fetch(request.url.replace("11901", "11902"));
      return HttpResponse.json(await real.json());
    }),
  );
  renderRoute(PATH);

  expect(await screen.findByText("마인드맵을 불러오지 못했어요")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

  expect(
    await screen.findByRole("group", { name: "기사 마인드맵" }),
  ).toBeDefined();
});

test("없는 기사면 화면 전체를 찾을 수 없음으로 바꾼다", async () => {
  renderRoute("/articles/999999");

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "기사를 찾을 수 없어요",
    }),
  ).toBeDefined();
  await waitFor(() =>
    expect(document.title).toBe("기사를 찾을 수 없어요 | NEW:LEARN"),
  );
});

test("주소의 id 가 숫자가 아니면 찾을 수 없음이다", async () => {
  renderRoute("/articles/abc");

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "기사를 찾을 수 없어요",
    }),
  ).toBeDefined();
});

test("손님이 기사 주소를 열면 로그인 화면으로 보낸다", async () => {
  server.use(
    http.get("/api/v1/members/me", () =>
      problem(401, "UNAUTHORIZED", "/api/v1/members/me"),
    ),
  );
  const { router } = renderRoute(`${PATH}?view=map`);

  await screen.findByRole("heading", { level: 1, name: "로그인" });
  expect(new URLSearchParams(router.state.location.search).get("next")).toBe(
    `${PATH}?view=map`,
  );
});

test("헤더의 이슈 보기를 누르면 그 사건 패널이 열린 이슈 화면으로 간다", async () => {
  const { router } = renderRoute(PATH);
  await heading();

  fireEvent.click(
    within(screen.getByRole("main")).getByRole("link", {
      name: "이 기사가 속한 이슈 보기",
    }),
  );

  await waitFor(() =>
    expect(router.state.location.pathname).toMatch(/^\/issues\/\d+$/),
  );
  expect(router.state.location.search).toBe("?event=119");
});

test("기사를 불러오지 못했는데 마인드맵 결과도 없으면 「아직 없어요」를 둔다 — 끝없이 불러오는 중이 아니다", async () => {
  server.use(
    http.get("/api/v1/articles/11901", ({ request }) =>
      problem(500, "INTERNAL_ERROR", new URL(request.url).pathname),
    ),
    http.get("/api/v1/articles/11901/mindmap", ({ request }) =>
      problem(404, "MINDMAP_NOT_FOUND", new URL(request.url).pathname),
    ),
  );
  renderRoute(PATH);

  expect(
    await screen.findByText("이 기사의 마인드맵이 아직 없어요"),
  ).toBeDefined();
  expect(
    screen.queryByRole("status", { name: "마인드맵 불러오는 중" }),
  ).toBeNull();
});

test("모르는 판이라 그리지 않으면 「AI 생성」을 붙이지 않는다", async () => {
  mindmapWith({ schemaVersion: "mindmap-v9" });
  renderRoute(PATH);

  await screen.findByText("이 마인드맵은 지금 보여 드릴 수 없어요");
  expect(screen.queryByText("AI 생성")).toBeNull();
});

test("흐름지도 탭에는 「AI 생성」을 붙이지 않는다 — 아직 그리는 것이 없다", async () => {
  renderRoute(PATH);
  await screen.findByRole("group", { name: "기사 마인드맵" });
  expect(screen.getByText("AI 생성")).toBeDefined();

  fireEvent.click(tab("흐름지도"));

  await screen.findByText("흐름지도 보기는 준비 중이에요");
  expect(screen.queryByText("AI 생성")).toBeNull();
});
