import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { expect, test } from "vitest";
import type { BookmarkState } from "@/api/bookmarks";
import { bookmarksQuery } from "@/api/bookmarks";
import { LatestArticles } from "@/components/home/LatestArticles";
import { server } from "@/mocks/node";
import { renderRoute } from "@/test/render";

// 북마크 버튼 (docs/plans/2026-11-03-bookmarks.md). 가짜 회원은 403 · 407 · 11902번 기사를 담아 두었다

function problem(status: number, code: string) {
  return HttpResponse.json(
    {
      type: "about:blank",
      title: code,
      status,
      detail: code,
      instance: "/api/v1/members/me/bookmarks/401",
      code,
    },
    { status },
  );
}

// A20 · A21 이 이 응답을 준다. 부른 방식을 모아 둔다
function bookmarkAnswers(
  response: (method: string, articleId: number) => Response | Promise<Response>,
) {
  const calls: string[] = [];
  const handle = ({
    request,
    params,
  }: {
    request: Request;
    params: Record<string, unknown>;
  }) => {
    calls.push(`${request.method} ${String(params.articleId)}`);
    return response(request.method, Number(params.articleId));
  };
  server.use(
    http.put("/api/v1/members/me/bookmarks/:articleId", handle),
    http.delete("/api/v1/members/me/bookmarks/:articleId", handle),
  );
  return calls;
}

const state = (articleId: number, bookmarked: boolean): BookmarkState => ({
  articleId,
  bookmarked,
  bookmarkedAt: bookmarked ? "2026-11-03T10:00:00+09:00" : null,
});

// 기사 마인드맵 머리의 북마크 — 제목 오른쪽 위 아이콘 버튼 (2026-11-12 사용자, Jira 195). 기사 화면에는 이 버튼 하나뿐이다
const headerButton = () =>
  screen.findByRole("button", { name: /나의 뉴스함에 담기$/ });

// 기사 화면을 두 번 그리던 한 테스트를 둘로 나눴다 — 전체 테스트를 함께 돌리면 두 번이 5초 한도를 나눠 쓰다 넘쳤다 (2026-11-04)
test("기사 머리 — 담은 기사면 눌린 아이콘으로 뜬다", async () => {
  renderRoute("/articles/403");

  const on = await headerButton();
  expect(on.getAttribute("aria-pressed")).toBe("true");
  expect(on.getAttribute("title")).toBe("나의 뉴스함에서 빼기");
});

test("기사 머리 — 담지 않은 기사면 눌리지 않은 아이콘으로 뜬다", async () => {
  renderRoute("/articles/401");

  const off = await headerButton();
  expect(off.getAttribute("aria-pressed")).toBe("false");
  expect(off.getAttribute("title")).toBe("나의 뉴스함에 담기");
});

test("기사 머리 — 누르면 A20 으로 담고 응답대로 눌린 아이콘으로 바꾸고 알린다", async () => {
  const calls = bookmarkAnswers((_, articleId) =>
    HttpResponse.json(state(articleId, true)),
  );
  const { queryClient } = renderRoute("/articles/401");
  queryClient.setQueryData(bookmarksQuery.queryKey, []);

  fireEvent.click(await headerButton());

  expect(await screen.findByText("나의 뉴스함에 담았어요")).toBeDefined();
  expect(calls).toEqual(["PUT 401"]);
  await waitFor(async () =>
    expect((await headerButton()).getAttribute("aria-pressed")).toBe("true"),
  );
  // 나의 뉴스함은 새로 받게 한다
  expect(
    queryClient.getQueryState(bookmarksQuery.queryKey)?.isInvalidated,
  ).toBe(true);
});

test("기사 행 — 담은 기사를 누르면 A21 로 빼고 그 행의 버튼을 바꾼다", async () => {
  const calls = bookmarkAnswers((_, articleId) =>
    HttpResponse.json(state(articleId, false)),
  );
  // 407번은 국제 기사다. 「전체」 첫 8개에는 들지 않는다
  renderRoute("/home?latest=world", [
    { path: "/home", element: <LatestArticles /> },
  ]);
  const button = await screen.findByRole("button", {
    name: "중동 휴전 연장 합의안 초안 공개 나의 뉴스함에 담기",
  });
  expect(button.getAttribute("aria-pressed")).toBe("true");
  expect(button.getAttribute("title")).toBe("나의 뉴스함에서 빼기");

  fireEvent.click(button);

  expect(await screen.findByText("나의 뉴스함에서 뺐어요")).toBeDefined();
  expect(calls).toEqual(["DELETE 407"]);
  await waitFor(() =>
    expect(button.getAttribute("aria-pressed")).toBe("false"),
  );
});

test("세션이 끝났으면(401) 로그인 화면으로 보낸다", async () => {
  bookmarkAnswers(() => problem(401, "UNAUTHORIZED"));
  const { router } = renderRoute("/articles/401");

  fireEvent.click(await headerButton());

  await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  expect(router.state.location.search).toBe("?next=/articles/401");
});

test("그 밖의 실패는 안내하고 버튼을 그대로 둔다", async () => {
  bookmarkAnswers(() => problem(500, "INTERNAL_ERROR"));
  renderRoute("/articles/401");

  fireEvent.click(await headerButton());

  expect(
    await screen.findByText(
      "북마크를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.",
    ),
  ).toBeDefined();
  expect((await headerButton()).getAttribute("aria-pressed")).toBe("false");
});

// 손님은 담지 않고 가입을 권한다 (EXPERIENCE.md Component Patterns 「가입 권유 창」, 2026-11-13 Jira 205)
const asGuest = () =>
  server.use(
    http.get("/api/v1/members/me", () => problem(401, "UNAUTHORIZED")),
  );
// 헤더에 *로그인* 이 뜨면 화면이 손님인 줄 안 것이다
const guestKnown = () => screen.findByRole("link", { name: "로그인" });
const signupDialog = () =>
  screen.findByRole("alertdialog", {
    name: "가입하면 더 편하게 이용할 수 있어요",
  });

test("손님이 누르면 보내지 않고 가입 권유 창을 띄운다", async () => {
  asGuest();
  const calls = bookmarkAnswers((_, articleId) =>
    HttpResponse.json(state(articleId, true)),
  );
  renderRoute("/articles/401");
  await guestKnown();

  fireEvent.click(await headerButton());

  expect(
    within(await signupDialog()).getByText(
      "마음에 드는 기사를 나의 뉴스함에 모아 볼 수 있어요.",
    ),
  ).toBeDefined();
  // 담기를 보내지 않는다 — 창이 열린 동안 뒤 화면은 화면 읽기에서 숨어서 버튼 상태는 닫기 시험에서 본다
  expect(calls).toEqual([]);
});

test("가입 권유 창의 가입하기는 지금 화면으로 돌아오는 가입 화면으로 간다", async () => {
  asGuest();
  const { router } = renderRoute("/articles/401?view=map");
  await guestKnown();
  fireEvent.click(await headerButton());

  fireEvent.click(
    within(await signupDialog()).getByRole("button", { name: "가입하기" }),
  );

  await waitFor(() => expect(router.state.location.pathname).toBe("/signup"));
  expect(router.state.location.search).toBe("?next=/articles/401%3Fview%3Dmap");
});

// fireEvent.click 은 버튼에 포커스를 주지 않는다 — Safari · iOS 에서 누를 때와 같다. 그래도 닫으면 누른 버튼으로 돌아온다 (리뷰, Jira 205)
test("가입 권유 창의 닫기는 창만 닫고 그 화면에 남으며, 포커스는 누른 버튼으로 돌아온다", async () => {
  asGuest();
  const { router } = renderRoute("/articles/401");
  await guestKnown();
  const button = await headerButton();
  expect(document.activeElement).not.toBe(button);
  fireEvent.click(button);

  fireEvent.click(
    within(await signupDialog()).getByRole("button", { name: "닫기" }),
  );

  await waitFor(() =>
    expect(
      screen.queryByRole("alertdialog", {
        name: "가입하면 더 편하게 이용할 수 있어요",
      }),
    ).toBeNull(),
  );
  expect(router.state.location.pathname).toBe("/articles/401");
  await waitFor(() => expect(document.activeElement).toBe(button));
  expect(button.getAttribute("aria-pressed")).toBe("false");
});

test("보내는 동안 다시 눌러도 두 번 보내지 않는다", async () => {
  let release: () => void = () => {};
  const calls = bookmarkAnswers(
    (_, articleId) =>
      new Promise<Response>((resolve) => {
        release = () => resolve(HttpResponse.json(state(articleId, true)));
      }),
  );
  renderRoute("/articles/401");

  fireEvent.click(await headerButton());
  await waitFor(() => expect(calls).toHaveLength(1));
  fireEvent.click(await headerButton());
  release();

  await screen.findByText("나의 뉴스함에 담았어요");
  expect(calls).toEqual(["PUT 401"]);
});
