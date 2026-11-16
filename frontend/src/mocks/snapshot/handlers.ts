import { http, HttpResponse } from "msw/http";
import { problem } from "@/mocks/handlers";
import { createDb, loadMindmaps, snapshot } from "@/mocks/snapshot/db";

// Vercel 데모(npm run dev:demo · --mode demo)의 가짜 API — 실제 기사 스냅샷으로 답한다 (Jira 220, src/mocks/snapshot/db.ts).
// src/main.tsx 가 로그인 상태 응답 뒤, 가짜 API(src/mocks/handlers.ts) 앞에 둔다. 콘텐츠 주소는 여기서 다 답하고
// (없으면 404 — 가짜 데이터로 새지 않게), 회원 · 로그인 · 용어사전과 검색어 검사 오류만 가짜 API 로 넘어간다

// 404 문구는 가짜 API 와 같다
const issueMissing = (instance: string) =>
  problem(404, "ISSUE_NOT_FOUND", "이슈를 찾을 수 없다", instance);
const eventMissing = (instance: string) =>
  problem(404, "EVENT_NOT_FOUND", "사건을 찾을 수 없다", instance);
const articleMissing = (instance: string) =>
  problem(404, "ARTICLE_NOT_FOUND", "기사를 찾을 수 없다", instance);

const pageParams = (url: string) => {
  const params = new URL(url).searchParams;
  return {
    params,
    page: Number(params.get("page") ?? 0),
    size: Number(params.get("size") ?? 20),
  };
};

/** 페이지를 열 때마다 새로 만든다 — 북마크 · 관심 이슈가 비어 있는 상태로 시작한다 */
export function createSnapshotHandlers() {
  const db = createDb(snapshot, loadMindmaps);
  const categoryMissing = (code: string | null, instance: string) =>
    code !== null && !db.hasCategory(code)
      ? problem(
          404,
          "CATEGORY_NOT_FOUND",
          `카테고리를 찾을 수 없다: ${code}`,
          instance,
        )
      : undefined;

  return [
    // A1
    http.get("/api/v1/categories", () =>
      HttpResponse.json({ items: db.categories() }),
    ),
    // A2 — 없는 분야는 404, 모르는 sort 값은 400
    http.get("/api/v1/issues", ({ request }) => {
      const { params, page, size } = pageParams(request.url);
      const category = params.get("category");
      const sort = params.get("sort") ?? "lastEventAt";
      const missing = categoryMissing(category, "/api/v1/issues");
      if (missing) return missing;
      if (sort !== "lastEventAt" && sort !== "createdAt") {
        return problem(
          400,
          "VALIDATION_FAILED",
          `모르는 정렬 기준: ${sort}`,
          "/api/v1/issues",
        );
      }
      return HttpResponse.json(db.issues({ category, sort, page, size }));
    }),
    // A3
    http.get("/api/v1/issues/:issueId", ({ params }) => {
      const found = db.issue(Number(params.issueId));
      return found
        ? HttpResponse.json(found)
        : issueMissing(`/api/v1/issues/${params.issueId}`);
    }),
    // A4
    http.get("/api/v1/issues/:issueId/timeline", ({ params }) => {
      const found = db.timeline(Number(params.issueId));
      return found
        ? HttpResponse.json(found)
        : issueMissing(`/api/v1/issues/${params.issueId}/timeline`);
    }),
    // A5
    http.get("/api/v1/events/:eventId", ({ params }) => {
      const found = db.event(Number(params.eventId));
      return found
        ? HttpResponse.json(found)
        : eventMissing(`/api/v1/events/${params.eventId}`);
    }),
    // A6 — 기본 오래된 순, sort=latest 면 최신 순
    http.get("/api/v1/events/:eventId/articles", ({ params, request }) => {
      const query = pageParams(request.url);
      const found = db.eventArticles(Number(params.eventId), {
        page: query.page,
        size: query.size,
        sort: query.params.get("sort") === "latest" ? "latest" : "oldest",
      });
      return found
        ? HttpResponse.json(found)
        : eventMissing(`/api/v1/events/${params.eventId}/articles`);
    }),
    // A7 — 없는 분야는 404
    http.get("/api/v1/articles", ({ request }) => {
      const { params, page, size } = pageParams(request.url);
      const category = params.get("category");
      const missing = categoryMissing(category, "/api/v1/articles");
      if (missing) return missing;
      return HttpResponse.json(db.latestArticles({ category, page, size }));
    }),
    // A8
    http.get("/api/v1/articles/:articleId", ({ params }) => {
      const found = db.article(Number(params.articleId));
      return found
        ? HttpResponse.json(found)
        : articleMissing(`/api/v1/articles/${params.articleId}`);
    }),
    // A9 — 분석이 안 끝난 기사는 404 MINDMAP_NOT_FOUND
    http.get("/api/v1/articles/:articleId/mindmap", async ({ params }) => {
      const instance = `/api/v1/articles/${params.articleId}/mindmap`;
      const found = await db.mindmap(Number(params.articleId));
      if (found === undefined) return articleMissing(instance);
      if (found === null)
        return problem(
          404,
          "MINDMAP_NOT_FOUND",
          "마인드맵 결과가 없다",
          instance,
        );
      return HttpResponse.json(found);
    }),
    // A13 — 검색어가 비었거나 50자를 넘으면 넘겨서 가짜 API 가 같은 400 으로 답하게 한다
    http.get("/api/v1/search", ({ request }) => {
      const word = (new URL(request.url).searchParams.get("q") ?? "")
        .trim()
        .normalize("NFC");
      if (word === "" || word.length > 50) return;
      return HttpResponse.json(db.search(word));
    }),
    // A20 · A21 · A22 — 나의 뉴스함
    http.put("/api/v1/members/me/bookmarks/:articleId", ({ params }) => {
      const state = db.addBookmark(Number(params.articleId));
      return state
        ? HttpResponse.json(state)
        : articleMissing(`/api/v1/members/me/bookmarks/${params.articleId}`);
    }),
    http.delete("/api/v1/members/me/bookmarks/:articleId", ({ params }) =>
      HttpResponse.json(db.removeBookmark(Number(params.articleId))),
    ),
    http.get("/api/v1/members/me/bookmarks", () =>
      HttpResponse.json({ items: db.bookmarks() }),
    ),
    // A23 · A24 · A25 — 관심 이슈
    http.put("/api/v1/members/me/interest-issues/:issueId", ({ params }) => {
      const state = db.addInterest(Number(params.issueId));
      return state
        ? HttpResponse.json(state)
        : issueMissing(`/api/v1/members/me/interest-issues/${params.issueId}`);
    }),
    http.delete("/api/v1/members/me/interest-issues/:issueId", ({ params }) =>
      HttpResponse.json(db.removeInterest(Number(params.issueId))),
    ),
    http.get("/api/v1/members/me/interest-issues", () =>
      HttpResponse.json({
        items: db.interestIssues(),
      }),
    ),
  ];
}
