import { afterEach, beforeEach, expect, test } from "vitest";
import { login, logout } from "@/api/auth";
import { fetchMe, signUp } from "@/api/members";
import { server } from "@/mocks/node";
import { createSessionHandlers, startFromLanding } from "@/mocks/session";

// 테스트는 늘 회원인 handlers.ts 를 쓴다. 여기서만 개발 화면(npm run dev:mock)처럼 로그인 상태를 기억하게 한다.
// 테스트마다 페이지를 새로 연 것처럼 새로 만든다
beforeEach(() => {
  server.use(...createSessionHandlers());
});

test("처음에는 손님이다", async () => {
  expect(await fetchMe()).toBeNull();
});

// 가짜 API 는 아이디 · 비밀번호를 보지 않는다
const account = { loginId: "seojin", password: "password123" }; // secret-scan:allow — 시험용 값

test("로그인하면 회원이 되고 로그아웃하면 다시 손님이다", async () => {
  await login(account);
  expect(await fetchMe()).toMatchObject({ loginId: "newlearn01" });

  await logout();
  expect(await fetchMe()).toBeNull();
});

test("가입하면 바로 회원이다", async () => {
  expect(await fetchMe()).toBeNull();

  await signUp({
    ...account,
    name: "김뉴런",
    categoryCodes: ["economy"],
  });
  expect(await fetchMe()).not.toBeNull();
});

test("새로 고치거나 다시 열면 손님으로 돌아간다", async () => {
  await login(account);
  expect(await fetchMe()).not.toBeNull();

  // 새로 고침 — main.tsx 가 페이지를 열 때마다 새로 만든다
  server.resetHandlers();
  server.use(...createSessionHandlers());

  expect(await fetchMe()).toBeNull();
});

afterEach(() => window.history.replaceState(null, "", "/"));

test.each(["/home", "/issues/12?event=3", "/login?next=/home"])(
  "페이지를 열면 %s 가 아니라 랜딩부터 시작한다",
  (path) => {
    window.history.replaceState(null, "", path);

    startFromLanding();

    expect(window.location.pathname + window.location.search).toBe("/");
  },
);
