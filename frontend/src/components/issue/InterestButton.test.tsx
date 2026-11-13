import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import { issueQuery } from "@/api/issue";
import {
  type InterestIssueState,
  interestIssuesQuery,
} from "@/api/interestIssues";
import { server } from "@/mocks/node";
import { renderRoute } from "@/test/render";

// 이슈 머리의 관심 이슈 별 (docs/plans/2026-11-03-interest-issues.md). 가짜 회원은 12 · 21번 이슈를 저장해 두었다

function problem(status: number, code: string) {
  return HttpResponse.json(
    {
      type: "about:blank",
      title: code,
      status,
      detail: code,
      instance: "/api/v1/members/me/interest-issues/13",
      code,
    },
    { status },
  );
}

// A23 · A24 가 이 응답을 준다. 부른 방식을 모아 둔다
function interestAnswers(
  response: (method: string, issueId: number) => Response | Promise<Response>,
) {
  const calls: string[] = [];
  const handle = ({
    request,
    params,
  }: {
    request: Request;
    params: Record<string, unknown>;
  }) => {
    calls.push(`${request.method} ${String(params.issueId)}`);
    return response(request.method, Number(params.issueId));
  };
  server.use(
    http.put("/api/v1/members/me/interest-issues/:issueId", handle),
    http.delete("/api/v1/members/me/interest-issues/:issueId", handle),
  );
  return calls;
}

const state = (issueId: number, interested: boolean): InterestIssueState => ({
  issueId,
  interested,
  interestedAt: interested ? "2026-11-03T10:00:00+09:00" : null,
});

async function openIssue(issueId: number) {
  const rendered = renderRoute(`/issues/${issueId}`);
  const star = await screen.findByRole("button", { name: "관심 이슈로 저장" });
  return { ...rendered, star };
}

// 이슈 화면을 두 번 그리던 한 테스트를 둘로 나눴다 — 전체 테스트를 함께 돌리면 두 번이 5초 한도를 나눠 쓰다 넘칠 뻔했다 (2026-11-04)
test("저장한 이슈면 별이 눌린 채로 뜬다", async () => {
  const { star } = await openIssue(12);

  expect(star.getAttribute("aria-pressed")).toBe("true");
  expect(star.getAttribute("title")).toBe("관심 이슈에서 빼기");
});

test("저장하지 않은 이슈면 별이 눌리지 않은 채로 뜬다", async () => {
  const { star } = await openIssue(13);

  expect(star.getAttribute("aria-pressed")).toBe("false");
  expect(star.getAttribute("title")).toBe("관심 이슈로 저장");
});

test("누르면 A23 으로 저장하고 응답대로 별을 채우고 알린다", async () => {
  const calls = interestAnswers((_, issueId) =>
    HttpResponse.json(state(issueId, true)),
  );
  const { star, queryClient } = await openIssue(13);

  fireEvent.click(star);

  expect(await screen.findByText("관심 이슈로 저장했어요")).toBeDefined();
  expect(calls).toEqual(["PUT 13"]);
  await waitFor(() => expect(star.getAttribute("aria-pressed")).toBe("true"));
  expect(queryClient.getQueryData(issueQuery(13).queryKey)?.interested).toBe(
    true,
  );
});

test("저장한 이슈를 누르면 A24 로 빼고 알린다", async () => {
  const calls = interestAnswers((_, issueId) =>
    HttpResponse.json(state(issueId, false)),
  );
  const { star } = await openIssue(12);

  fireEvent.click(star);

  expect(await screen.findByText("관심 이슈에서 뺐어요")).toBeDefined();
  expect(calls).toEqual(["DELETE 12"]);
  await waitFor(() => expect(star.getAttribute("aria-pressed")).toBe("false"));
});

test("저장하면 관심 이슈 목록을 다시 받게 한다", async () => {
  interestAnswers((_, issueId) => HttpResponse.json(state(issueId, true)));
  const { star, queryClient } = await openIssue(13);
  queryClient.setQueryData(interestIssuesQuery.queryKey, []);

  fireEvent.click(star);

  await screen.findByText("관심 이슈로 저장했어요");
  expect(
    queryClient.getQueryState(interestIssuesQuery.queryKey)?.isInvalidated,
  ).toBe(true);
});

test("세션이 끝났으면(401) 로그인 화면으로 보낸다", async () => {
  interestAnswers(() => problem(401, "UNAUTHORIZED"));
  const { star, router } = await openIssue(13);

  fireEvent.click(star);

  await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  expect(router.state.location.search).toBe("?next=/issues/13");
});

test("그 밖의 실패는 안내하고 별을 그대로 둔다", async () => {
  interestAnswers(() => problem(500, "INTERNAL_ERROR"));
  const { star } = await openIssue(13);

  fireEvent.click(star);

  expect(
    await screen.findByText(
      "관심 이슈를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.",
    ),
  ).toBeDefined();
  expect(star.getAttribute("aria-pressed")).toBe("false");
});

test("보내는 동안 다시 눌러도 두 번 보내지 않는다", async () => {
  let release: () => void = () => {};
  const calls = interestAnswers(
    (_, issueId) =>
      new Promise<Response>((resolve) => {
        release = () => resolve(HttpResponse.json(state(issueId, true)));
      }),
  );
  const { star } = await openIssue(13);

  fireEvent.click(star);
  await waitFor(() => expect(calls).toHaveLength(1));
  fireEvent.click(star);
  release();

  await screen.findByText("관심 이슈로 저장했어요");
  expect(calls).toEqual(["PUT 13"]);
});

// 손님은 저장하지 않고 가입을 권한다 (EXPERIENCE.md Component Patterns 「가입 권유 창」, 2026-11-13 Jira 205)
test("손님이 누르면 보내지 않고 가입 권유 창을 띄운다 — 가입하기는 이 이슈로 돌아오는 가입 화면이다", async () => {
  server.use(
    http.get("/api/v1/members/me", () => problem(401, "UNAUTHORIZED")),
  );
  const calls = interestAnswers((_, issueId) =>
    HttpResponse.json(state(issueId, true)),
  );
  const { star, router } = await openIssue(13);
  // 헤더에 *로그인* 이 뜨면 화면이 손님인 줄 안 것이다
  await screen.findByRole("link", { name: "로그인" });

  fireEvent.click(star);

  const dialog = await screen.findByRole("alertdialog", {
    name: "가입하면 더 편하게 이용할 수 있어요",
  });
  expect(
    within(dialog).getByText(
      "관심 이슈로 저장하면 홈 추천에서 먼저 보여 드려요.",
    ),
  ).toBeDefined();
  expect(calls).toEqual([]);

  fireEvent.click(within(dialog).getByRole("button", { name: "가입하기" }));

  await waitFor(() => expect(router.state.location.pathname).toBe("/signup"));
  expect(router.state.location.search).toBe("?next=/issues/13");
});

// Esc 는 맨 위에 열린 것 하나만 닫는다 (EXPERIENCE.md Interaction Primitives) — 넓은 화면의 사건 패널은 창 뒤에 남는다 (리뷰, Jira 205)
test("사건 패널이 열린 채 손님의 가입 권유 창을 Esc 로 닫으면 창만 닫히고 패널은 남는다", async () => {
  server.use(
    http.get("/api/v1/members/me", () => problem(401, "UNAUTHORIZED")),
  );
  const { router } = renderRoute("/issues/12?event=117");
  const star = await screen.findByRole("button", { name: "관심 이슈로 저장" });
  await screen.findByRole("link", { name: "로그인" });
  fireEvent.click(star);
  const dialog = await screen.findByRole("alertdialog", {
    name: "가입하면 더 편하게 이용할 수 있어요",
  });

  fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape" });

  await waitFor(() =>
    expect(
      screen.queryByRole("alertdialog", {
        name: "가입하면 더 편하게 이용할 수 있어요",
      }),
    ).toBeNull(),
  );
  expect(router.state.location.search).toBe("?event=117");
});
