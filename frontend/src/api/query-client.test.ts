import { MutationObserver } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";
import { ApiError } from "@/api/error";
import { type Member, meQuery } from "@/api/members";
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

// 세션이 끝난 401 은 어느 조회 · 저장에서 받든 「내 정보」를 손님(null)으로 바꾼다 — 가드(RequireMember)가 로그인 화면으로 보낸다
// (EXPERIENCE.md 이동 규칙, docs/plans/2026-11-04-session-expired-login.md)
describe("세션이 끝난 401 — 내 정보를 손님으로 바꾼다", () => {
  const member: Member = {
    id: 7,
    loginId: "newlearn01",
    name: "김뉴런",
    categories: [],
  };

  function signedIn() {
    const client = createQueryClient();
    client.setQueryData(meQuery.queryKey, member);
    return client;
  }

  const failWith = (status: number, code: string) => () =>
    Promise.reject(new ApiError({ status, code }));

  test("조회가 401 UNAUTHORIZED 면 손님이 된다", async () => {
    const client = signedIn();

    await client
      .fetchQuery({
        queryKey: ["bookmarks"],
        queryFn: failWith(401, "UNAUTHORIZED"),
      })
      .catch(() => {});

    expect(client.getQueryData(meQuery.queryKey)).toBeNull();
  });

  test("저장이 401 UNAUTHORIZED 면 손님이 된다", async () => {
    const client = signedIn();

    await new MutationObserver(client, {
      mutationFn: failWith(401, "UNAUTHORIZED"),
    })
      .mutate()
      .catch(() => {});

    expect(client.getQueryData(meQuery.queryKey)).toBeNull();
  });

  test.each([
    [401, "LOGIN_FAILED"],
    [403, "CSRF_INVALID"],
    [500, "INTERNAL_ERROR"],
  ])("%i %s 는 내 정보를 그대로 둔다", async (status, code) => {
    const client = signedIn();

    await new MutationObserver(client, { mutationFn: failWith(status, code) })
      .mutate()
      .catch(() => {});
    await client
      .fetchQuery({ queryKey: ["any"], queryFn: failWith(status, code) })
      .catch(() => {});

    expect(client.getQueryData(meQuery.queryKey)).toEqual(member);
  });
});
