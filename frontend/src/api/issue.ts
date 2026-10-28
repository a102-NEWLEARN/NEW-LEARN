import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { IssueSummary } from "@/api/issues";

/**
 * A3 이슈 헤더 (docs/api-screen.md A3). A2 항목에서 lastEvent 만 뺀 모양이고 뜻도 같다.
 * 사건이 0개인 이슈는 기간이 null 이고 개수가 0이다
 */
export type IssueDetail = Omit<
  IssueSummary,
  "lastEvent" | "firstEventAt" | "lastEventAt"
> & {
  firstEventAt: string | null;
  lastEventAt: string | null;
};

/** A3 — 없는 이슈는 404 ISSUE_NOT_FOUND */
export function fetchIssue(issueId: number) {
  return api.get<IssueDetail>(`/issues/${issueId}`).then((res) => res.data);
}

export const issueQuery = (issueId: number) =>
  queryOptions({
    queryKey: ["issue", issueId],
    queryFn: () => fetchIssue(issueId),
  });
