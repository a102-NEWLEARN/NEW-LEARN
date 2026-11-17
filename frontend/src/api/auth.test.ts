import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import { login, logout } from "@/api/auth";
import { clearTabLogin } from "@/lib/tabLogin";
import { server } from "@/mocks/node";

// A15 로그인 · A16 로그아웃 (docs/api-screen.md A15 · A16)

const account = { loginId: "newlearn01", password: "password1" }; // secret-scan:allow — 시험용 값

function problem(status: number, code: string, instance: string) {
  return HttpResponse.json(
    { type: "about:blank", title: code, status, detail: code, instance, code },
    { status },
  );
}

test("로그인하면 회원 정보를 받는다", async () => {
  const member = await login(account);

  expect(member).toMatchObject({ id: 7, loginId: "newlearn01" });
});

test("로그인은 아이디 · 비밀번호를 본문으로 보낸다", async () => {
  let body: unknown;
  server.use(
    http.post("/api/v1/auth/login", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({
        id: 7,
        loginId: "newlearn01",
        name: "김뉴런",
        categories: [],
      });
    }),
  );

  await login(account);

  expect(body).toEqual(account);
});

test("아이디가 없거나 비밀번호가 틀리면 401 LOGIN_FAILED 를 던진다", async () => {
  server.use(
    http.post("/api/v1/auth/login", () =>
      problem(401, "LOGIN_FAILED", "/api/v1/auth/login"),
    ),
  );

  await expect(login({ ...account, password: "wrong" })).rejects.toMatchObject({
    status: 401,
    code: "LOGIN_FAILED",
  });
});

test("잠긴 아이디는 429 TOO_MANY_REQUESTS 를 던진다", async () => {
  server.use(
    http.post("/api/v1/auth/login", () =>
      problem(429, "TOO_MANY_REQUESTS", "/api/v1/auth/login"),
    ),
  );

  await expect(login(account)).rejects.toMatchObject({
    status: 429,
    code: "TOO_MANY_REQUESTS",
  });
});

test("로그아웃하면 204 를 받고 아무것도 돌려주지 않는다", async () => {
  await expect(logout()).resolves.toBeUndefined();
});

test("세션이 이미 없으면(401) 로그아웃한 것으로 보고 던지지 않는다", async () => {
  server.use(
    http.post("/api/v1/auth/logout", () =>
      problem(401, "UNAUTHORIZED", "/api/v1/auth/logout"),
    ),
  );

  await expect(logout()).resolves.toBeUndefined();
});

test("CSRF 번호표가 없거나 틀리면(403) 세션이 남았을 수 있어 던진다", async () => {
  server.use(
    http.post("/api/v1/auth/logout", () =>
      problem(403, "FORBIDDEN", "/api/v1/auth/logout"),
    ),
  );

  await expect(logout()).rejects.toMatchObject({
    status: 403,
    code: "FORBIDDEN",
  });
});

// 탭을 닫으면 로그아웃 — 로그인한 탭에 표시를 두고 로그아웃하면 지운다 (2026-11-17 사용자)
test("로그인하면 이 탭에 로그인 표시를 둔다", async () => {
  clearTabLogin();

  await login({ loginId: "newlearn01", password: "password123" });
  expect(sessionStorage.getItem("newlearn.tab-login")).toBe("1");
});

test("로그아웃하면 이 탭의 로그인 표시를 지운다 — 세션이 이미 없던(401) 때도", async () => {
  sessionStorage.setItem("newlearn.tab-login", "1");
  await logout();
  expect(sessionStorage.getItem("newlearn.tab-login")).toBeNull();

  sessionStorage.setItem("newlearn.tab-login", "1");
  server.use(
    http.post("/api/v1/auth/logout", () =>
      HttpResponse.json({ status: 401, code: "UNAUTHORIZED" }, { status: 401 }),
    ),
  );
  await logout();
  expect(sessionStorage.getItem("newlearn.tab-login")).toBeNull();
});
