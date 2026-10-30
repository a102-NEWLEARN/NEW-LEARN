import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { login, logout } from "@/api/auth";
import { fetchMe, signUp } from "@/api/members";
import { server } from "@/mocks/node";
import { sessionHandlers } from "@/mocks/session";

// 테스트는 늘 회원인 handlers.ts 를 쓴다. 여기서만 개발 화면(npm run dev:mock)처럼 로그인 상태를 기억하게 한다
beforeEach(() => {
  sessionStorage.clear();
  server.use(...sessionHandlers);
});
afterEach(() => sessionStorage.clear());

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

test("새로 고쳐도 로그인 상태가 남는다", async () => {
  await login(account);

  // 새로 고침 — 모듈을 처음부터 다시 읽는다
  vi.resetModules();
  const fresh = await import("@/mocks/session");
  server.resetHandlers();
  server.use(...fresh.sessionHandlers);

  expect(await fetchMe()).not.toBeNull();
});
