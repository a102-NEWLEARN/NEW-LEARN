import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import { fetchMe } from "@/api/members";
import { server } from "@/mocks/node";

// A17 내 정보 — 200 이면 회원, 401 이면 손님 (docs/api-screen.md A17)

function problem(status: number, code: string) {
  return HttpResponse.json(
    {
      type: "about:blank",
      title: "Error",
      status,
      detail: code,
      instance: "/api/v1/members/me",
      code,
    },
    { status },
  );
}

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
