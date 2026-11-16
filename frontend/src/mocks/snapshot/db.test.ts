import { expect, test } from "vitest";
import { createDb, loadMindmaps, snapshot } from "@/mocks/snapshot/db";

// Vercel 데모(mode demo)가 쓰는 실제 기사 스냅샷 (Jira 220, docs/plans/2026-11-16-demo-snapshot.md).
// 값은 스냅샷에서 계산해 비교한다 — 스냅샷을 다시 만들어도 테스트를 고치지 않게

const newDb = () => createDb(snapshot, loadMindmaps);
const issueIds = snapshot.issues.map((issue) => issue.id);
const articleList = Object.values(snapshot.articles);

test("흐름의 사건은 모두 사건 상세가 있고, 사건 기사는 모두 기사 상세가 있다", () => {
  for (const id of issueIds) {
    for (const event of snapshot.timelines[id].events) {
      expect(snapshot.events[event.id], `사건 ${event.id}`).toBeDefined();
      for (const articleId of snapshot.eventArticles[event.id]) {
        expect(snapshot.articles[articleId], `기사 ${articleId}`).toBeDefined();
      }
    }
  }
});

test("분야는 받은 순서대로, 이슈 · 기사 수는 스냅샷 기준으로 센다", () => {
  const categories = newDb().categories();

  expect(categories.map((c) => c.code)).toEqual(
    snapshot.categories.map((c) => c.code),
  );
  for (const category of categories) {
    expect(category.issueCount).toBe(
      snapshot.issues.filter((issue) =>
        issue.categories.some((c) => c.code === category.code),
      ).length,
    );
    expect(category.articleCount).toBe(
      articleList.filter((a) => a.category?.code === category.code).length,
    );
  }
});

test("이슈 목록은 분야로 거르고 마지막 사건 최신순, 쪽을 나눈다", () => {
  const db = newDb();
  const code = snapshot.categories[0].code;
  const inCategory = snapshot.issues.filter((issue) =>
    issue.categories.some((c) => c.code === code),
  );

  const first = db.issues({
    category: code,
    sort: "lastEventAt",
    page: 0,
    size: 2,
  });
  const second = db.issues({
    category: code,
    sort: "lastEventAt",
    page: 1,
    size: 2,
  });

  expect(first.totalElements).toBe(inCategory.length);
  expect(first.totalPages).toBe(Math.ceil(inCategory.length / 2));
  const ids = [...first.items, ...second.items].map((issue) => issue.id);
  expect(ids).toEqual(
    [...inCategory]
      .sort(
        (a, b) => b.lastEventAt!.localeCompare(a.lastEventAt!) || b.id - a.id,
      )
      .slice(0, 4)
      .map((issue) => issue.id),
  );
});

test("이슈 목록은 만든 때 최신순으로도 준다", () => {
  const all = newDb().issues({ sort: "createdAt", page: 0, size: 100 });

  expect(all.items.map((issue) => issue.createdAt)).toEqual(
    snapshot.issues
      .map((issue) => issue.createdAt)
      .sort()
      .reverse(),
  );
});

test("이슈 목록 항목의 최근 사건은 흐름에서 가장 늦은 사건이다", () => {
  const all = newDb().issues({ sort: "lastEventAt", page: 0, size: 100 });

  expect(all.items).toHaveLength(snapshot.issues.length);
  for (const item of all.items) {
    const latest = snapshot.timelines[item.id].events.reduce((a, b) =>
      b.occurredAt.localeCompare(a.occurredAt) > 0 ? b : a,
    );
    expect(item.lastEvent?.id).toBe(latest.id);
    expect(item.lastEventAt).toBe(latest.occurredAt);
  }
});

test("사건 기사는 오래된 순이 기본이고 latest 면 뒤집는다, 쪽을 나눈다", () => {
  const db = newDb();
  const [eventId, ids] = Object.entries(snapshot.eventArticles).find(
    ([, list]) => list.length > 5,
  )!;

  const oldest = db.eventArticles(Number(eventId), {
    page: 0,
    size: 5,
    sort: "oldest",
  })!;
  const latest = db.eventArticles(Number(eventId), {
    page: 0,
    size: 5,
    sort: "latest",
  })!;
  const next = db.eventArticles(Number(eventId), {
    page: 1,
    size: 5,
    sort: "oldest",
  })!;

  expect(oldest.items.map((a) => a.id)).toEqual(ids.slice(0, 5));
  expect(next.items.map((a) => a.id)).toEqual(ids.slice(5, 10));
  expect(latest.items.map((a) => a.id)).toEqual(ids.toReversed().slice(0, 5));
  expect(oldest.totalElements).toBe(ids.length);
  // 목록 항목은 기사 요약 모양이다 — 상세에만 있는 칸은 빠진다
  expect(oldest.items[0]).not.toHaveProperty("reporter");
});

test("없는 사건이면 사건 기사도 없다", () => {
  expect(
    newDb().eventArticles(-1, { page: 0, size: 5, sort: "oldest" }),
  ).toBeUndefined();
});

test("최신 기사는 분야로 거르고 발행 시각 최신순이다", () => {
  const code = snapshot.categories[1].code;
  const page = newDb().latestArticles({ category: code, page: 0, size: 8 });

  const expected = articleList
    .filter((a) => a.category?.code === code)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.id - a.id);
  expect(page.items.map((a) => a.id)).toEqual(
    expected.slice(0, 8).map((a) => a.id),
  );
  expect(page.totalElements).toBe(expected.length);
});

test("기사 상세에는 기자 · 사건 · 이슈가 있고, 없는 기사는 undefined", () => {
  const db = newDb();
  const any = articleList[0];

  expect(db.article(any.id)).toMatchObject({
    id: any.id,
    reporter: any.reporter,
    event: any.event,
    issue: any.issue,
  });
  expect(db.article(-1)).toBeUndefined();
});

test("마인드맵은 분석이 끝난 기사에만 있고, 없는 기사는 undefined", async () => {
  const db = newDb();
  const done = articleList.find((a) => a.mindmapStatus === "SUCCEEDED")!;
  const notDone = articleList.find((a) => a.mindmapStatus !== "SUCCEEDED");

  expect(await db.mindmap(done.id)).toMatchObject({ articleId: done.id });
  if (notDone) expect(await db.mindmap(notDone.id)).toBeNull();
  expect(await db.mindmap(-1)).toBeUndefined();
});

test("검색은 제목에 든 것을 유형마다 최신순 20개까지 준다", () => {
  const word = "스마트안경";
  const result = newDb().search(word);

  expect(result.issues.length).toBeGreaterThan(0);
  for (const list of [result.issues, result.events, result.articles]) {
    expect(list.length).toBeLessThanOrEqual(20);
    for (const item of list) expect(item.title).toContain(word);
  }
  for (const event of result.events) {
    expect(
      snapshot.timelines[event.issueId].events.some((e) => e.id === event.id),
    ).toBe(true);
  }
  const dates = result.articles.map((a) => snapshot.articles[a.id].publishedAt);
  expect(dates).toEqual([...dates].sort().reverse());
});

test("영문 검색어는 대소문자를 가리지 않는다", () => {
  const db = newDb();
  const withLatin = articleList.find((a) => /[A-Za-z]{2,}/.test(a.title))!;
  const latin = withLatin.title.match(/[A-Za-z]{2,}/)![0];

  expect(db.search(latin.toLowerCase()).articles.length).toBeGreaterThan(0);
  expect(db.search(latin.toLowerCase()).articles.length).toBe(
    db.search(latin.toUpperCase()).articles.length,
  );
});

test("기사를 담으면 상세 · 목록 · 나의 뉴스함에 보이고, 빼면 돌아간다", () => {
  const db = newDb();
  const id = articleList[0].id;

  expect(db.addBookmark(id)).toMatchObject({ articleId: id, bookmarked: true });
  expect(db.article(id)?.bookmarked).toBe(true);
  expect(db.bookmarks().map((a) => a.id)).toEqual([id]);
  const eventId = db.article(id)!.event!.id;
  const inEvent = db.eventArticles(eventId, {
    page: 0,
    size: 100,
    sort: "oldest",
  })!;
  expect(inEvent.items.find((a) => a.id === id)?.bookmarked).toBe(true);

  expect(db.removeBookmark(id)).toMatchObject({
    bookmarked: false,
    bookmarkedAt: null,
  });
  expect(db.article(id)?.bookmarked).toBe(false);
  expect(db.bookmarks()).toEqual([]);
  expect(db.addBookmark(-1)).toBeUndefined();
});

test("이슈를 저장하면 상세 · 목록 · 관심 이슈에 보이고, 빼면 돌아간다", () => {
  const db = newDb();
  const id = issueIds[0];

  expect(db.addInterest(id)).toMatchObject({ issueId: id, interested: true });
  expect(db.issue(id)?.interested).toBe(true);
  expect(
    db
      .issues({ sort: "lastEventAt", page: 0, size: 100 })
      .items.find((i) => i.id === id)?.interested,
  ).toBe(true);
  expect(db.interestIssues().map((i) => i.id)).toEqual([id]);

  expect(db.removeInterest(id)).toMatchObject({
    interested: false,
    interestedAt: null,
  });
  expect(db.issue(id)?.interested).toBe(false);
  expect(db.interestIssues()).toEqual([]);
  expect(db.addInterest(-1)).toBeUndefined();
});

test("담은 상태는 db 마다 따로다 — 페이지를 다시 열면 비어 있다", () => {
  const first = newDb();
  first.addBookmark(articleList[0].id);

  expect(first.bookmarks()).toHaveLength(1);
  expect(newDb().bookmarks()).toEqual([]);
});
