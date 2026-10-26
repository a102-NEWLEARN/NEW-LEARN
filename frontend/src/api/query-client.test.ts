import { describe, expect, test } from "vitest";
import { ApiError } from "@/api/error";
import { createQueryClient, shouldRetry } from "@/api/query-client";

describe("shouldRetry — 4xx 는 다시 부르지 않고, 그 밖은 한 번만 다시 부른다", () => {
  test.each([
    [0, 400, false],
    [0, 401, false],
    [0, 404, false],
    [0, 500, true],
    [1, 500, false],
    [0, 502, true],
    [0, null, true],
    [1, null, false],
  ])("앞서 %i번 실패, status %s → %s", (failureCount, status, expected) => {
    const error = new ApiError({ status, code: null });

    expect(shouldRetry(failureCount, error)).toBe(expected);
  });

  test("createQueryClient 가 이 규칙을 쓴다", () => {
    const client = createQueryClient();

    expect(client.getDefaultOptions().queries?.retry).toBe(shouldRetry);
  });
});
