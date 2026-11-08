import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import { type Member, meQuery } from "@/api/members";
import { server } from "@/mocks/node";
import { renderRoute } from "@/test/render";

// 마이페이지 관심 분야 바꾸기 (docs/plans/2026-11-03-interest-categories.md). 회원은 handlers.ts 의 A17 예시 —
// 김뉴런, 관심 분야 경제 · IT·과학

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
// 카드 제목 오른쪽 *저장*. 보내는 동안에는 SEED 가 버튼 안에 진행 표시를 넣어 이름 앞이 바뀐다
const saveButton = () => screen.getByRole("button", { name: /저장$/ });

test("안내와 함께 지금 관심 분야를 고른 칩으로 시작한다", async () => {
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
  // 저장 줄(안내 · *홈으로* · *저장하고 홈으로*)은 없다 — 저장은 제목 오른쪽 버튼 하나다 (2026-11-05 사용자)
  expect(within(section).queryByRole("link", { name: "홈으로" })).toBeNull();
  expect(within(section).getByRole("button", { name: "저장" })).toBeDefined();
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

test("관심 분야가 0개인 회원이 그대로 저장하면 안내하고 보내지 않는다", async () => {
  server.use(
    http.get("/api/v1/members/me", () => HttpResponse.json(saved([]))),
  );
  const bodies = saveAnswers((codes) => HttpResponse.json(saved(codes)));
  const { section, router } = await openSettings();

  fireEvent.click(saveButton());

  expect(
    await within(section).findByText("관심 분야를 1개 이상 골라 주세요."),
  ).toBeDefined();
  expect(document.activeElement).toBe(
    within(section).getByRole("group", { name: "관심 분야" }),
  );
  expect(bodies).toEqual([]);
  expect(router.state.location.pathname).toBe("/me");
});

test("서버가 칸 오류를 주면 칩 아래에 그대로 띄우고 머문다", async () => {
  saveAnswers(() =>
    problem(400, "VALIDATION_FAILED", {
      errors: [{ field: "categoryCodes", reason: "없는 분야가 있어요" }],
    }),
  );
  const { section, router } = await openSettings();

  fireEvent.click(saveButton());

  expect(await within(section).findByText("없는 분야가 있어요")).toBeDefined();
  expect(router.state.location.pathname).toBe("/me");
});

test("세션이 끝났으면(401) 로그인 화면으로 보낸다", async () => {
  saveAnswers(() => problem(401, "UNAUTHORIZED"));
  const { router } = await openSettings();

  fireEvent.click(saveButton());

  await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  expect(router.state.location.search).toBe("?next=/me");
});

test("그 밖의 실패는 버튼 아래에 안내를 띄우고 머문다", async () => {
  saveAnswers(() => problem(500, "INTERNAL_ERROR"));
  const { section, router } = await openSettings();

  fireEvent.click(saveButton());

  const alert = await within(section).findByRole("alert");
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
  const { router } = await openSettings();

  fireEvent.click(saveButton());
  await waitFor(() => expect(bodies).toHaveLength(1));
  fireEvent.click(saveButton());
  release();

  expect(await screen.findByText("관심사를 저장했어요")).toBeDefined();
  expect(bodies).toHaveLength(1);
  expect(router.state.location.pathname).toBe("/me");
});
