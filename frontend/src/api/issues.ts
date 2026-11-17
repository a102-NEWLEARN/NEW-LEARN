import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { Page } from "@/api/types";

/** A2 이슈 목록의 항목 (docs/api-screen.md A2). 시각은 오프셋이 붙은 문자열이다 */
export type IssueSummary = {
  id: number;
  title: string;
  summary: string | null;
  categories: { code: string; name: string }[];
  eventCount: number;
  articleCount: number;
  publisherCount: number;
  /** 기간. 사건이 0개인 이슈면 null (정상 생성은 사건 3개부터라 드물다) */
  firstEventAt: string | null;
  lastEventAt: string | null;
  createdAt: string;
  /** 카드의 「최근 사건」. 사건이 0개인 이슈면 null */
  lastEvent: {
    id: number;
    title: string;
    label: string;
    occurredAt: string;
  } | null;
  /** 로그인한 회원이 관심 이슈로 저장했나 — 별을 채울지. 손님이면 false */
  interested: boolean;
};

export type IssuesParams = {
  /** 이 분야의 이슈만. 없으면 전체 */
  category?: string;
  /** 기본은 lastEventAt(마지막 사건 최신순). createdAt 은 새로 생긴 이슈 순 */
  sort?: "lastEventAt" | "createdAt";
  page?: number;
  size?: number;
};

export function fetchIssues(params: IssuesParams = {}) {
  return api
    .get<Page<IssueSummary>>("/issues", { params })
    .then((res) => res.data);
}

export const issuesQuery = (params: IssuesParams = {}) =>
  queryOptions({
    queryKey: ["issues", params],
    queryFn: () => fetchIssues(params),
  });

/** 분야별 이슈 화면 한 쪽의 이슈 수 (EXPERIENCE.md IA 분야별 이슈 행) */
export const ISSUES_PAGE_SIZE = 12;

/** 분야 이슈를 모두 모을 때 한 번에 받는 수 — A2 size 의 최대 */
export const ISSUES_ALL_SIZE = 100;

// 분야별 이슈 화면 — 그 분야 이슈를 모두 받아 둔다(100 넘으면 쪽을 이어 받는다). 기사 많은 순은 A2 에 없어
// 받은 것을 화면이 줄 세우고, 쪽도 화면이 12개씩 나눈다 (2026-11-13 사용자, Jira 203).
// 응답은 A2 한 쪽과 같은 모양으로 둔다 — 별을 누르면 setInterested 가 items 안을 그대로 고친다 (interestIssues.ts).
// 받는 사이 순서가 바뀌어 같은 이슈가 두 번 오면 처음 것만 남긴다
export const issuesAllQuery = (category: string) =>
  queryOptions({
    queryKey: ["issues", "all", { category }],
    queryFn: async (): Promise<Page<IssueSummary>> => {
      const first = await fetchIssues({
        category,
        page: 0,
        size: ISSUES_ALL_SIZE,
      });
      const all = [...first.items];
      for (let page = 1; page < first.totalPages; page++) {
        const next = await fetchIssues({
          category,
          page,
          size: ISSUES_ALL_SIZE,
        });
        all.push(...next.items);
      }
      const seen = new Set<number>();
      const items = all.filter(
        (issue) => !seen.has(issue.id) && seen.add(issue.id),
      );
      return {
        items,
        page: 0,
        size: items.length,
        totalElements: items.length,
        totalPages: 1,
      };
    },
  });
