import {
  AxiosError,
  AxiosHeaders,
  type InternalAxiosRequestConfig,
} from "axios";
import { describe, expect, test } from "vitest";
import { ApiError, toApiError } from "@/api/error";

const config: InternalAxiosRequestConfig = { headers: new AxiosHeaders() };

function responseError(status: number, data: unknown) {
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, null, {
    status,
    statusText: "",
    headers: {},
    config,
    data,
  });
}

// 기대값의 출처는 docs/api.md 2절 「오류 응답 필드」 다
describe("toApiError — 오류 응답을 ApiError 로 바꾼다", () => {
  test("Problem Details 의 status · code 를 옮긴다", () => {
    const error = toApiError(
      responseError(404, {
        type: "about:blank",
        title: "Not Found",
        status: 404,
        detail: "기사를 찾을 수 없다: 456",
        instance: "/api/v1/articles/456",
        code: "ARTICLE_NOT_FOUND",
      }),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.code).toBe("ARTICLE_NOT_FOUND");
    expect(error.errors).toEqual([]);
  });

  test("VALIDATION_FAILED 의 칸별 오류를 옮긴다", () => {
    const error = toApiError(
      responseError(400, {
        type: "about:blank",
        title: "Bad Request",
        status: 400,
        detail: "요청 값이 규칙에 맞지 않는다",
        instance: "/api/v1/members",
        code: "VALIDATION_FAILED",
        errors: [{ field: "loginId", reason: "아이디는 4자 이상이에요" }],
      }),
    );

    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.errors).toEqual([
      { field: "loginId", reason: "아이디는 4자 이상이에요" },
    ]);
  });

  test("본문이 Problem Details 가 아니면 code 는 null 이다", () => {
    const error = toApiError(responseError(502, "<html>Bad Gateway</html>"));

    expect(error.status).toBe(502);
    expect(error.code).toBeNull();
  });

  test("서버에 닿지 못하면 status 와 code 가 null 이다", () => {
    const error = toApiError(new AxiosError("Network Error", "ERR_NETWORK"));

    expect(error.status).toBeNull();
    expect(error.code).toBeNull();
  });

  test("axios 오류가 아니어도 ApiError 로 감싼다", () => {
    const cause = new Error("boom");
    const error = toApiError(cause);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBeNull();
    expect(error.cause).toBe(cause);
  });

  test("이미 ApiError 면 그대로 돌려준다", () => {
    const original = new ApiError({ status: 500, code: "INTERNAL_ERROR" });

    expect(toApiError(original)).toBe(original);
  });
});
