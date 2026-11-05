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
