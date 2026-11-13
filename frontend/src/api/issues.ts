import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
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

/** 분야별 이슈 화면이 처음 보이고 *더 보기* 마다 더 붙이는 이슈 수 (EXPERIENCE.md IA 분야별 이슈 행) */
export const ISSUES_PAGE_SIZE = 12;

// 분야별 이슈 화면 — *더 보기* 마다 다음 쪽을 불러 아래에 붙인다. 쪽은 분야마다 따로 쌓인다.
// 키에 "pages" 를 끼워 홈 추천의 한 쪽짜리 응답(["issues", {…}])과 모양이 섞이지 않게 한다.
// 별을 누르면 setInterested 가 둘 다 고친다 (interestIssues.ts)
export const issuesPagesQuery = (category: string) =>
  infiniteQueryOptions({
    queryKey: ["issues", "pages", { category }],
    queryFn: ({ pageParam }) =>
      fetchIssues({ category, page: pageParam, size: ISSUES_PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.page + 1 < last.totalPages ? last.page + 1 : undefined,
  });
