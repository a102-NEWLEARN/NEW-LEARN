import { AxiosError, type AxiosAdapter } from "axios";
import { http, HttpResponse } from "msw/http";
import { afterEach, expect, test } from "vitest";
import { api } from "@/api/client";
import { ApiError } from "@/api/error";
import { server } from "@/mocks/node";

test("api 는 /api/v1 아래를 부른다", () => {
  expect(api.defaults.baseURL).toBe("/api/v1");
});

test("api 는 오류를 ApiError 로 바꿔 던진다", async () => {
  const adapter: AxiosAdapter = async (config) => {
    throw new AxiosError("Request failed", "ERR_BAD_REQUEST", config, null, {
      status: 404,
      statusText: "",
      headers: {},
      config,
      data: { status: 404, code: "ISSUE_NOT_FOUND" },
    });
  };

  const request = api.get("/issues/1", { adapter });

  await expect(request).rejects.toBeInstanceOf(ApiError);
  await expect(request).rejects.toMatchObject({
    status: 404,
    code: "ISSUE_NOT_FOUND",
  });
});

// CSRF 번호표 — 서버가 준 XSRF-TOKEN 쿠키 값을 POST · PUT · DELETE 때 X-XSRF-TOKEN 머리로 돌려보낸다.
// axios 기본 이름이 backend 와 같아서 client 는 따로 붙이지 않는다 (docs/api.md 1절 「인증」)

afterEach(() => {
  document.cookie = "XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});

test.each(["post", "put", "delete"] as const)(
  "%s 요청에 XSRF-TOKEN 쿠키 값을 X-XSRF-TOKEN 머리로 붙인다",
  async (method) => {
    document.cookie = "XSRF-TOKEN=token-123";
    let header: string | null = null;
    server.use(
      http[method]("/api/v1/csrf-check", ({ request }) => {
        header = request.headers.get("X-XSRF-TOKEN");
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await api.request({ method, url: "/csrf-check" });

    expect(header).toBe("token-123");
  },
);

test("번호표가 바뀌면 다음 요청부터 새 값을 싣는다 — 로그인 · 로그아웃 때 서버가 새로 준다", async () => {
  const headers: (string | null)[] = [];
  server.use(
    http.post("/api/v1/csrf-check", ({ request }) => {
      headers.push(request.headers.get("X-XSRF-TOKEN"));
      return new HttpResponse(null, { status: 204 });
    }),
  );

  document.cookie = "XSRF-TOKEN=before-login";
  await api.post("/csrf-check");
  document.cookie = "XSRF-TOKEN=after-login";
  await api.post("/csrf-check");

  expect(headers).toEqual(["before-login", "after-login"]);
});
