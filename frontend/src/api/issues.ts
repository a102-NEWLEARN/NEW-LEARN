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
  firstEventAt: string;
  lastEventAt: string;
  createdAt: string;
  lastEvent: { id: number; title: string; label: string; occurredAt: string };
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
