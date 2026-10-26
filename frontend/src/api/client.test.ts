import { AxiosError, type AxiosAdapter } from "axios";
import { expect, test } from "vitest";
import { api } from "@/api/client";
import { ApiError } from "@/api/error";

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
