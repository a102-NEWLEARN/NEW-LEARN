import { screen, waitFor, within } from "@testing-library/react";
import { http } from "msw/http";
import { expect, test } from "vitest";
import { problem as apiProblem } from "@/mocks/handlers";
import { server } from "@/mocks/node";
import { renderRoute } from "@/test/render";

// 마이페이지 — 이름 · 개수 줄과 개인정보 · 관심 분야 · 관심 이슈 카드. 회원은 handlers.ts 의 A17 예시다.
// 로그아웃(A16)은 헤더 프로필 메뉴로 옮겼다 — 시험은 components/shell/ProfileMenu.test.tsx (2026-11-05, S15P31A102-182)

async function openMyPage() {
  const rendered = renderRoute("/me");
  await within(screen.getByRole("main")).findByRole("heading", {
    level: 1,
    name: "김뉴런님",
  });
  return rendered;
}

test("셸 안에 이름 · 아이디를 띄우고, 로그아웃 버튼은 두지 않는다", async () => {
  await openMyPage();

  const main = screen.getByRole("main");
  const info = within(main).getByRole("region", { name: "개인정보" });
  expect(within(info).getByText("김뉴런")).toBeDefined();
  expect(within(info).getByText("newlearn01")).toBeDefined();
  // 로그아웃은 헤더 프로필 메뉴에 있다 — 이름 줄 오른쪽은 어색했다 (2026-11-05 사용자)
  expect(within(main).queryByRole("button", { name: /로그아웃/ })).toBeNull();
  expect(document.title).toContain("마이페이지");
});

test("섹션은 개인정보 → 관심 분야 → 관심 이슈 차례다", async () => {
  await openMyPage();
  const main = screen.getByRole("main");
  await within(main).findByRole("region", { name: "관심 분야" });

  expect(
    within(main)
      .getAllByRole("region")
      .map((region) => region.getAttribute("aria-labelledby"))
      .map((id) => document.getElementById(id ?? "")?.textContent),
  ).toEqual(["개인정보", "관심 분야", "관심 이슈"]);
});

// 마이페이지의 관심 이슈 목록(A25)이 401 이어도 로그인 화면으로 (Jira 165)
test("관심 이슈를 받다가 세션이 끝났으면(401) 로그인 화면으로 보낸다", async () => {
  server.use(
    http.get("/api/v1/members/me/interest-issues", () =>
      apiProblem(
        401,
        "UNAUTHORIZED",
        "UNAUTHORIZED",
        "/api/v1/members/me/interest-issues",
      ),
    ),
  );
  const { router } = renderRoute("/me");

  await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  expect(router.state.location.search).toBe("?next=/me");
});

// 이름 아래 머리 줄 — 모바일 v1 · v21 MyPageScreen (Jira 163). 관심 분야는 저장된 것(A17), 관심 이슈는 A25, 북마크는 A22 의 개수
test("이름 아래에 관심 분야 · 관심 이슈 · 북마크 개수를 보인다", async () => {
  await openMyPage();

  expect(
    await within(screen.getByRole("main")).findByText(
      "관심 분야 2개 · 관심 이슈 2개 · 북마크 3개",
    ),
  ).toBeDefined();
});

test("개수 하나라도 못 받으면 머리 줄을 그리지 않는다", async () => {
  server.use(
    http.get("/api/v1/members/me/bookmarks", () =>
      apiProblem(
        500,
        "INTERNAL_ERROR",
        "서버 오류",
        "/api/v1/members/me/bookmarks",
      ),
    ),
  );
  await openMyPage();
  // 관심 이슈 목록이 그려질 때까지 기다린 뒤에도 줄이 없다
  await within(screen.getByRole("main")).findByRole("link", {
    name: /한빛반도체 미국 공장 건설/,
  });

  expect(screen.queryByText(/관심 분야 \d+개/)).toBeNull();
});
