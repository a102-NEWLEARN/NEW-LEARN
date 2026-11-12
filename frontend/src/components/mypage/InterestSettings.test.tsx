import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import { type Member, meQuery } from "@/api/members";
import { server } from "@/mocks/node";
import { renderRoute } from "@/test/render";

// 마이페이지 관심 분야 바꾸기 (docs/plans/2026-11-03-interest-categories.md). 회원은 handlers.ts 의 A17 예시 —
// 김뉴런, 관심 분야 경제 · IT·과학.
// 저장은 섹션 제목 옆 *저장* 대신 화면 아래에 붙은 *변경사항 저장하기* 하나이고, 바꾼 채 나가려 하면 확인 창을 띄운다
// (2026-11-12 사용자, Jira 195)

function problem(status: number, code: string, extra: object = {}) {
  return HttpResponse.json(
    {
      type: "about:blank",
      title: code,
      status,
      detail: code,
      instance: "/api/v1/members/me/categories",
      code,
      ...extra,
    },
    { status },
  );
}

// A18 이 이 응답을 준다. 보낸 본문을 모아 둔다
function saveAnswers(
  response: (codes: string[]) => Response | Promise<Response>,
) {
  const bodies: string[][] = [];
  server.use(
    http.put("/api/v1/members/me/categories", async ({ request }) => {
      const { categoryCodes } = (await request.json()) as {
        categoryCodes: string[];
      };
      bodies.push(categoryCodes);
      return response(categoryCodes);
    }),
  );
  return bodies;
}

const saved = (codes: string[]): Member => ({
  id: 7,
  loginId: "newlearn01",
  name: "김뉴런",
  categories: codes.map((code) => ({ code, name: code })),
});

async function openSettings(path = "/me") {
  const rendered = renderRoute(path);
  const section = await within(screen.getByRole("main")).findByRole("region", {
    name: "관심 분야",
  });
  await within(section).findByRole("button", { name: "정치" });
  return { ...rendered, section };
}

const chip = (section: HTMLElement, name: string) =>
  within(section).getByRole("button", { name });
// 화면 아래 *변경사항 저장하기*. 보내는 동안에는 SEED 가 버튼 안에 진행 표시를 넣어 이름 앞이 바뀐다
const saveButton = () =>
  screen.getByRole("button", {
    name: /변경사항 저장하기$/,
  }) as HTMLButtonElement;
const leaveDialog = () =>
  screen.queryByRole("alertdialog", { name: "저장하지 않고 나갈까요?" });

test("안내와 함께 지금 관심 분야를 고른 칩으로 시작하고, 저장은 화면 아래 버튼 하나다", async () => {
  const { section } = await openSettings();

  expect(
    within(section).getByText("홈 추천 탭에 고른 분야가 나와요."),
  ).toBeDefined();
  expect(
    within(section).getByRole("group", { name: "관심 분야" }),
  ).toBeDefined();
  expect(chip(section, "경제").getAttribute("aria-pressed")).toBe("true");
  expect(chip(section, "IT·과학").getAttribute("aria-pressed")).toBe("true");
  expect(chip(section, "정치").getAttribute("aria-pressed")).toBe("false");
  // 섹션 제목 옆 *저장* 은 없다 — 맨 아래 *변경사항 저장하기* 하나
  expect(within(section).queryByRole("button", { name: /저장/ })).toBeNull();
  expect(section.contains(saveButton())).toBe(false);
});

test("바꾼 것이 없으면 저장을 누를 수 없고, 바꾸면 누를 수 있고, 되돌리면 다시 못 누른다", async () => {
  const { section } = await openSettings();
  expect(saveButton().disabled).toBe(true);

  fireEvent.click(chip(section, "정치"));
  expect(saveButton().disabled).toBe(false);

  fireEvent.click(chip(section, "정치"));
  expect(saveButton().disabled).toBe(true);
});

test("고치고 저장하면 A18 로 보내고 내 정보를 바꾸고 알림을 띄우고 마이페이지에 남는다", async () => {
  const bodies = saveAnswers((codes) => HttpResponse.json(saved(codes)));
  const { section, router, queryClient } = await openSettings();

  fireEvent.click(chip(section, "IT·과학"));
  fireEvent.click(chip(section, "정치"));
  fireEvent.click(saveButton());

  expect(await screen.findByText("관심사를 저장했어요")).toBeDefined();
  expect(bodies).toEqual([["economy", "politics"]]);
  expect(queryClient.getQueryData(meQuery.queryKey)).toEqual(
    saved(["economy", "politics"]),
  );
  expect(router.state.location.pathname).toBe("/me");
  // 저장한 것과 같아져 다시 누를 수 없다
  await waitFor(() => expect(saveButton().disabled).toBe(true));
});

test("마지막 남은 칩은 풀리지 않고 안내한다", async () => {
  const { section } = await openSettings();

  fireEvent.click(chip(section, "IT·과학"));
  fireEvent.click(chip(section, "경제"));

  expect(chip(section, "경제").getAttribute("aria-pressed")).toBe("true");
  expect(
    within(section).getByText("관심 분야를 1개 이상 골라 주세요."),
  ).toBeDefined();
});

test("서버가 칸 오류를 주면 칩 아래에 그대로 띄우고 머문다", async () => {
  saveAnswers(() =>
    problem(400, "VALIDATION_FAILED", {
      errors: [{ field: "categoryCodes", reason: "없는 분야가 있어요" }],
    }),
  );
  const { section, router } = await openSettings();

  fireEvent.click(chip(section, "정치"));
  fireEvent.click(saveButton());

  expect(await within(section).findByText("없는 분야가 있어요")).toBeDefined();
  expect(router.state.location.pathname).toBe("/me");
});

test("세션이 끝났으면(401) 바꾼 것이 있어도 묻지 않고 로그인 화면으로 보낸다", async () => {
  saveAnswers(() => problem(401, "UNAUTHORIZED"));
  const { section, router } = await openSettings();

  fireEvent.click(chip(section, "정치"));
  fireEvent.click(saveButton());

  await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  expect(router.state.location.search).toBe("?next=/me");
  expect(leaveDialog()).toBeNull();
});

test("그 밖의 실패는 저장 버튼 위에 안내를 띄우고 머문다", async () => {
  saveAnswers(() => problem(500, "INTERNAL_ERROR"));
  const { section, router } = await openSettings();

  fireEvent.click(chip(section, "정치"));
  fireEvent.click(saveButton());

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe(
    "일시적으로 서비스를 사용할 수 없어요. 잠시 후 다시 시도해 주세요.",
  );
  expect(router.state.location.pathname).toBe("/me");
});

test("보내는 동안 다시 눌러도 두 번 보내지 않는다", async () => {
  let release: () => void = () => {};
  const bodies = saveAnswers(
    (codes) =>
      new Promise<Response>((resolve) => {
        release = () => resolve(HttpResponse.json(saved(codes)));
      }),
  );
  const { section, router } = await openSettings();

  fireEvent.click(chip(section, "정치"));
  fireEvent.click(saveButton());
  await waitFor(() => expect(bodies).toHaveLength(1));
  fireEvent.click(saveButton());
  release();

  expect(await screen.findByText("관심사를 저장했어요")).toBeDefined();
  expect(bodies).toHaveLength(1);
  expect(router.state.location.pathname).toBe("/me");
});

test("바꾼 채 다른 화면으로 가려 하면 확인 창을 띄우고, 계속 고치기면 바꾼 것을 둔 채 머문다", async () => {
  const { section, router } = await openSettings();
  fireEvent.click(chip(section, "정치"));

  await act(() => router.navigate("/home"));

  const dialog = leaveDialog()!;
  expect(
    within(dialog).getByText("바꾼 관심 분야가 저장되지 않아요."),
  ).toBeDefined();
  fireEvent.click(within(dialog).getByRole("button", { name: "계속 고치기" }));

  await waitFor(() => expect(leaveDialog()).toBeNull());
  expect(router.state.location.pathname).toBe("/me");
  expect(chip(section, "정치").getAttribute("aria-pressed")).toBe("true");
});

test("확인 창에서 나가기를 누르면 저장하지 않고 간다", async () => {
  const bodies = saveAnswers((codes) => HttpResponse.json(saved(codes)));
  const { section, router } = await openSettings();
  fireEvent.click(chip(section, "정치"));

  await act(() => router.navigate("/home"));
  fireEvent.click(
    within(leaveDialog()!).getByRole("button", { name: "나가기" }),
  );

  await waitFor(() => expect(router.state.location.pathname).toBe("/home"));
  expect(bodies).toEqual([]);
});

test("바꾸지 않았거나 저장한 뒤에는 묻지 않고 간다", async () => {
  saveAnswers((codes) => HttpResponse.json(saved(codes)));
  const { section, router } = await openSettings();

  fireEvent.click(chip(section, "정치"));
  fireEvent.click(saveButton());
  await screen.findByText("관심사를 저장했어요");
  await waitFor(() => expect(saveButton().disabled).toBe(true));

  await act(() => router.navigate("/home"));

  expect(router.state.location.pathname).toBe("/home");
  expect(leaveDialog()).toBeNull();
});

test("바꾼 채 로그아웃하면 묻지 않고 랜딩으로 간다", async () => {
  server.use(
    http.post(
      "/api/v1/auth/logout",
      () => new HttpResponse(null, { status: 204 }),
    ),
  );
  const { section, router } = await openSettings();
  fireEvent.click(chip(section, "정치"));

  const header = screen.getByRole("banner");
  fireEvent.click(within(header).getByRole("button", { name: "마이페이지" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /로그아웃/ }));

  await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  expect(leaveDialog()).toBeNull();
});

// 확인 창이 닫힐 때 SEED(Radix FocusScope)가 열기 전 포커스 자리(눌렀던 헤더 링크)로 포커스를 돌려준다 —
// 다른 화면으로 갔으면 그 화면 제목(h1)에 있어야 한다 (EXPERIENCE.md Accessibility Floor, 리뷰 Jira 195)
test("확인 창에서 나가기를 누르면 포커스가 새 화면 제목에 남는다", async () => {
  const { section } = await openSettings();
  fireEvent.click(chip(section, "정치"));
  const bookmarks = within(screen.getByRole("banner")).getByRole("link", {
    name: "나의 뉴스함",
  });
  bookmarks.focus();
  fireEvent.click(bookmarks);
  fireEvent.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "나가기",
    }),
  );

  const heading = await within(screen.getByRole("main")).findByRole("heading", {
    level: 1,
    name: "나의 뉴스함",
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(document.activeElement).toBe(heading);
});

// 저장하면 버튼이 꺼진다(바꾼 것이 없다) — 버튼에 있던 포커스가 body 로 떨어지지 않게 칩 묶음으로 옮긴다 (리뷰, Jira 195)
test("키보드로 저장하면 꺼진 버튼 대신 관심 분야 칩 묶음에 포커스가 간다", async () => {
  saveAnswers((codes) => HttpResponse.json(saved(codes)));
  const { section } = await openSettings();
  fireEvent.click(chip(section, "정치"));
  saveButton().focus();

  fireEvent.click(saveButton());

  await waitFor(() => expect(saveButton().disabled).toBe(true));
  expect(document.activeElement).toBe(
    within(section).getByRole("group", { name: "관심 분야" }),
  );
});
