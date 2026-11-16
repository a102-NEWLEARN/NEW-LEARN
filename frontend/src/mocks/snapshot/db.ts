import type { ArticleDetail } from "@/api/article";
import type { BookmarkItem, BookmarkState } from "@/api/bookmarks";
import type { Category } from "@/api/categories";
import type { EventDetail } from "@/api/event";
import type {
  InterestIssueItem,
  InterestIssueState,
} from "@/api/interestIssues";
import type { IssueDetail } from "@/api/issue";
import type { IssueSummary } from "@/api/issues";
import type { Mindmap } from "@/api/mindmap";
import type { SearchResult } from "@/api/search";
import type { Timeline } from "@/api/timeline";
import type { ArticleSummary, EventRef, Page } from "@/api/types";
// 큰 JSON 을 그대로 import 하면 TS 가 모양을 추론하느라 tsc 가 느려진다 — 글자로 받아 JSON.parse 한다
import snapshotJson from "./data/snapshot.json?raw";

// Vercel 데모(mode demo)의 실제 기사 스냅샷 (Jira 220, docs/plans/2026-11-16-demo-snapshot.md).
// 2026-11-16 newlearn.io.kr 공개 API 에서 홈 이슈 16개와 그 사건 · 기사 · 마인드맵을 받아 묶었다 (frontend/README.md 「가짜 API」).
// 목록 · 정렬 · 쪽 나누기 · 검색 규칙은 가짜 API(src/mocks/handlers.ts)와 같고, 수는 스냅샷 기준으로 다시 센다

export type Snapshot = {
  capturedAt: string;
  /** 코드 · 이름 · 순서만. 이슈 · 기사 수는 categories() 가 센다 */
  categories: { code: string; name: string }[];
  /** A3 응답 그대로 */
  issues: IssueDetail[];
  /** 이슈 id → A4 응답 그대로 */
  timelines: Record<string, Timeline>;
  /** 사건 id → A5 응답 그대로 */
  events: Record<string, EventDetail>;
  /** 사건 id → 그 사건 기사 id, 오래된 순(A6 기본 정렬) */
  eventArticles: Record<string, number[]>;
  /** 기사 id → A8 응답 그대로 */
  articles: Record<string, ArticleDetail>;
};

export const snapshot = JSON.parse(snapshotJson) as Snapshot;

let mindmaps: Promise<Record<string, Mindmap>> | undefined;
/** 마인드맵(약 1.9MB)은 처음 열 때 따로 받는다 — 데모 첫 화면을 가볍게 */
export function loadMindmaps() {
  mindmaps ??= import("./data/mindmaps.json?raw").then(
    (module) => JSON.parse(module.default) as Record<string, Mindmap>,
  );
  return mindmaps;
}

type IssueSort = "lastEventAt" | "createdAt";
type EventArticlesSort = "oldest" | "latest";

const SEARCH_LIMIT = 20;

const page = <T>(all: T[], at: number, size: number): Page<T> => ({
  items: all.slice(at * size, (at + 1) * size),
  page: at,
  size,
  totalElements: all.length,
  totalPages: Math.ceil(all.length / size),
});

// 늦은 것 먼저, 같으면 id 가 큰 것 먼저
const newestFirst =
  <T extends { id: number }>(at: (item: T) => string | null) =>
  (a: T, b: T) =>
    (at(b) ?? "").localeCompare(at(a) ?? "") || b.id - a.id;

// 담은 시각 — 진짜 API 처럼 한국 시간 +09:00
const kstIso = (date: Date) =>
  new Date(date.getTime() + 9 * 3_600_000).toISOString().slice(0, 19) +
  "+09:00";

/** 기사 상세(A8)에서 목록 항목(A6 · A7) 칸만 */
const toSummary = ({
  id,
  title,
  publisher,
  publishedAt,
  category,
  summary,
  url,
  mindmapStatus,
  bookmarked,
}: ArticleSummary): ArticleSummary => ({
  id,
  title,
  publisher,
  publishedAt,
  category,
  summary,
  url,
  mindmapStatus,
  bookmarked,
});

/**
 * 스냅샷 위의 가짜 서버. 북마크 · 관심 이슈는 이 db 의 메모리에만 둔다 —
 * 페이지를 열 때마다 새로 만들어 비어 있다 (로그인 상태 src/mocks/session.ts 와 같다)
 */
export function createDb(
  data: Snapshot,
  load: () => Promise<Record<string, Mindmap>>,
  now = () => new Date(),
) {
  const bookmarkedAt = new Map<number, string>();
  const interestedAt = new Map<number, string>();
  const articles = Object.values(data.articles);
  const issueOf = (id: number) => data.issues.find((issue) => issue.id === id);
  const inCategory = (issue: IssueDetail, code?: string | null) =>
    !code || issue.categories.some((category) => category.code === code);

  const lastEventOf = (issueId: number): EventRef | null => {
    const events = data.timelines[issueId]?.events ?? [];
    if (events.length === 0) return null;
    const { id, title, label, occurredAt } = events.reduce((a, b) =>
      b.occurredAt.localeCompare(a.occurredAt) > 0 ? b : a,
    );
    return { id, title, label, occurredAt };
  };
  const issueDetail = (issue: IssueDetail): IssueDetail => ({
    ...issue,
    interested: interestedAt.has(issue.id),
  });
  const issueSummary = (issue: IssueDetail): IssueSummary => ({
    ...issueDetail(issue),
    lastEvent: lastEventOf(issue.id),
  });
  const articleSummary = (article: ArticleDetail): ArticleSummary => ({
    ...toSummary(article),
    bookmarked: bookmarkedAt.has(article.id),
  });

  return {
    hasCategory: (code: string) =>
      data.categories.some((category) => category.code === code),

    /** A1 */
    categories: (): Category[] =>
      data.categories.map(({ code, name }) => ({
        code,
        name,
        issueCount: data.issues.filter((issue) => inCategory(issue, code))
          .length,
        articleCount: articles.filter(
          (article) => article.category?.code === code,
        ).length,
      })),

    /** A2 */
    issues: ({
      category,
      sort,
      page: at,
      size,
    }: {
      category?: string | null;
      sort: IssueSort;
      page: number;
      size: number;
    }): Page<IssueSummary> =>
      page(
        data.issues
          .filter((issue) => inCategory(issue, category))
          .sort(newestFirst((issue) => issue[sort]))
          .map(issueSummary),
        at,
        size,
      ),

    /** A3 */
    issue: (id: number) => {
      const found = issueOf(id);
      return found && issueDetail(found);
    },

    /** A4 */
    timeline: (id: number): Timeline | undefined => data.timelines[id],

    /** A5 */
    event: (id: number): EventDetail | undefined => data.events[id],

    /** A6 — 없는 사건이면 undefined */
    eventArticles: (
      id: number,
      {
        page: at,
        size,
        sort,
      }: { page: number; size: number; sort: EventArticlesSort },
    ): Page<ArticleSummary> | undefined => {
      const ids = data.eventArticles[id];
      if (!ids) return undefined;
      const ordered = sort === "latest" ? ids.toReversed() : ids;
      return page(
        ordered.map((articleId) => articleSummary(data.articles[articleId])),
        at,
        size,
      );
    },

    /** A7 */
    latestArticles: ({
      category,
      page: at,
      size,
    }: {
      category?: string | null;
      page: number;
      size: number;
    }): Page<ArticleSummary> =>
      page(
        articles
          .filter((article) => !category || article.category?.code === category)
          .sort(newestFirst((article) => article.publishedAt))
          .map(articleSummary),
        at,
        size,
      ),

    /** A8 — 없는 기사면 undefined */
    article: (id: number): ArticleDetail | undefined => {
      const found = data.articles[id];
      return found && { ...found, bookmarked: bookmarkedAt.has(id) };
    },

    /** A9 — 없는 기사면 undefined, 분석이 안 끝난 기사면 null */
    mindmap: async (id: number): Promise<Mindmap | null | undefined> => {
      const found = data.articles[id];
      if (!found) return undefined;
      if (found.mindmapStatus !== "SUCCEEDED") return null;
      return (await load())[id] ?? null;
    },

    /** A13 — 제목에 든 것. 유형마다 최신순 20개까지 */
    search: (word: string): SearchResult => {
      const has = (title: string) =>
        title.toLowerCase().includes(word.toLowerCase());
      const events = data.issues.flatMap((issue) =>
        (data.timelines[issue.id]?.events ?? []).map((event) => ({
          ...event,
          issueId: issue.id,
        })),
      );
      return {
        issues: data.issues
          .filter((issue) => has(issue.title))
          .sort(newestFirst((issue) => issue.createdAt))
          .slice(0, SEARCH_LIMIT)
          .map(({ id, title }) => ({ id, title })),
        events: events
          .filter((event) => has(event.title))
          .sort(newestFirst((event) => event.occurredAt))
          .slice(0, SEARCH_LIMIT)
          .map(({ id, title, issueId }) => ({ id, title, issueId })),
        articles: articles
          .filter((article) => has(article.title))
          .sort(newestFirst((article) => article.publishedAt))
          .slice(0, SEARCH_LIMIT)
          .map(({ id, title }) => ({ id, title })),
      };
    },

    /** A20 — 이미 담았으면 담은 시각 그대로. 없는 기사면 undefined */
    addBookmark: (id: number): BookmarkState | undefined => {
      if (!data.articles[id]) return undefined;
      if (!bookmarkedAt.has(id)) bookmarkedAt.set(id, kstIso(now()));
      return {
        articleId: id,
        bookmarked: true,
        bookmarkedAt: bookmarkedAt.get(id)!,
      };
    },

    /** A21 — 기사를 확인하지 않는다 */
    removeBookmark: (id: number): BookmarkState => {
      bookmarkedAt.delete(id);
      return { articleId: id, bookmarked: false, bookmarkedAt: null };
    },

    /** A22 — 담은 시각 최신순 */
    bookmarks: (): BookmarkItem[] =>
      [...bookmarkedAt]
        .map(([id, at]) => ({
          ...articleSummary(data.articles[id]),
          bookmarkedAt: at,
        }))
        .sort(newestFirst((item) => item.bookmarkedAt)),

    /** A23 — 이미 저장했으면 저장한 시각 그대로. 없는 이슈면 undefined */
    addInterest: (id: number): InterestIssueState | undefined => {
      if (!issueOf(id)) return undefined;
      if (!interestedAt.has(id)) interestedAt.set(id, kstIso(now()));
      return {
        issueId: id,
        interested: true,
        interestedAt: interestedAt.get(id)!,
      };
    },

    /** A24 — 이슈를 확인하지 않는다 */
    removeInterest: (id: number): InterestIssueState => {
      interestedAt.delete(id);
      return { issueId: id, interested: false, interestedAt: null };
    },

    /** A25 — 저장한 시각 최신순 */
    interestIssues: (): InterestIssueItem[] =>
      [...interestedAt]
        .map(([id, at]) => ({
          ...issueSummary(issueOf(id)!),
          interestedAt: at,
        }))
        .sort(newestFirst((item) => item.interestedAt)),
  };
}

export type SnapshotDb = ReturnType<typeof createDb>;
