import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import type { FieldError } from "@/api/error";
import { changeCategories, fetchMe, signUp } from "@/api/members";
import { server } from "@/mocks/node";

// A14 가입 · A17 내 정보 · A18 관심 분야 바꾸기 (docs/api-screen.md A14 · A17 · A18)

function problem(status: number, code: string, errors?: FieldError[]) {
  return HttpResponse.json(
    {
      type: "about:blank",
      title: "Error",
      status,
      detail: code,
      instance: "/api/v1/members/me",
      code,
      errors,
    },
    { status },
  );
}

const newMember = {
  loginId: "newbie_01",
  password: "password123",
  name: "새 회원",
  categoryCodes: ["it_science", "economy", "economy"],
};

// A17 — 200 이면 회원, 401 이면 손님

test("로그인했으면 회원 정보를 받는다", async () => {
  const me = await fetchMe();

  expect(me).toEqual({
    id: 7,
    loginId: "newlearn01",
    name: "김뉴런",
    categories: [
      { code: "economy", name: "경제" },
      { code: "it_science", name: "IT·과학" },
    ],
  });
});

test("401 이면 손님이라 null 을 받는다", async () => {
  server.use(
    http.get("/api/v1/members/me", () => problem(401, "UNAUTHORIZED")),
  );

  await expect(fetchMe()).resolves.toBeNull();
});

test("401 이 아닌 오류는 그대로 던진다", async () => {
  server.use(
    http.get("/api/v1/members/me", () => problem(500, "INTERNAL_ERROR")),
  );

  await expect(fetchMe()).rejects.toMatchObject({
    status: 500,
    code: "INTERNAL_ERROR",
  });
});

// A14 — 가입하면 곧바로 로그인된 회원 정보를 받는다

test("가입하면 회원 정보를 받는다 — 관심 분야는 겹친 것을 합쳐 A1 순서로", async () => {
  const member = await signUp(newMember);

  expect(member).toMatchObject({ loginId: "newbie_01", name: "새 회원" });
  expect(member.categories).toEqual([
    { code: "economy", name: "경제" },
    { code: "it_science", name: "IT·과학" },
  ]);
});

test("가입은 아이디 · 비밀번호 · 이름 · 관심 분야를 본문으로 보낸다", async () => {
  let body: unknown;
  server.use(
    http.post("/api/v1/members", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(
        { id: 8, loginId: "newbie_01", name: "새 회원", categories: [] },
        { status: 201 },
      );
    }),
  );

  await signUp(newMember);

  expect(body).toEqual(newMember);
});

test("규칙에 안 맞으면 400 VALIDATION_FAILED 와 칸별 이유를 던진다", async () => {
  const errors = [
    { field: "loginId", reason: "영문 소문자 · 숫자 · _ 로 4~20자" },
  ];
  server.use(
    http.post("/api/v1/members", () =>
      problem(400, "VALIDATION_FAILED", errors),
    ),
  );

  await expect(signUp(newMember)).rejects.toMatchObject({
    status: 400,
    code: "VALIDATION_FAILED",
    errors,
  });
});

test("아이디를 이미 누가 쓰면 409 LOGIN_ID_TAKEN 을 던진다", async () => {
  server.use(
    http.post("/api/v1/members", () => problem(409, "LOGIN_ID_TAKEN")),
  );

  await expect(signUp(newMember)).rejects.toMatchObject({
    status: 409,
    code: "LOGIN_ID_TAKEN",
  });
});

// A18 — 보낸 목록으로 통째로 바꾸고 바뀐 회원 정보를 받는다

test("관심 분야를 바꾸면 바뀐 회원 정보를 받는다", async () => {
  const member = await changeCategories(["world", "politics"]);

  expect(member).toMatchObject({ id: 7, loginId: "newlearn01" });
  expect(member.categories).toEqual([
    { code: "politics", name: "정치" },
    { code: "world", name: "국제" },
  ]);
});

test("관심 분야는 PUT 본문 categoryCodes 로 보낸다", async () => {
  let body: unknown;
  server.use(
    http.put("/api/v1/members/me/categories", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({
        id: 7,
        loginId: "newlearn01",
        name: "김뉴런",
        categories: [],
      });
    }),
  );

  await changeCategories(["world"]);

  expect(body).toEqual({ categoryCodes: ["world"] });
});

test("관심 분야가 0개면 400 VALIDATION_FAILED 를 던진다", async () => {
  server.use(
    http.put("/api/v1/members/me/categories", () =>
      problem(400, "VALIDATION_FAILED", [
        { field: "categoryCodes", reason: "관심 분야를 하나 이상 골라 주세요" },
      ]),
    ),
  );

  await expect(changeCategories([])).rejects.toMatchObject({
    status: 400,
    code: "VALIDATION_FAILED",
  });
});
