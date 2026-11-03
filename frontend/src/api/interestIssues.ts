import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { IssueSummary } from "@/api/issues";
import type { ItemList } from "@/api/types";

/** A23 · A24 의 응답 — 바뀐 뒤의 관심 이슈 상태. 별은 이 interested 로 맞춘다 (docs/api-screen.md A23 · A24) */
export type InterestIssueState = {
  issueId: number;
  interested: boolean;
  /** 저장한 시각. 뺐으면 null */
  interestedAt: string | null;
};

/**
 * A25 관심 이슈 목록의 항목 — A2 이슈 카드(interested 는 늘 true)에 저장한 시각을 더한다.
 * 사건이 0개인 이슈도 나와서 기간 · 마지막 사건이 null 일 수 있다 (docs/api-screen.md A25)
 */
export type InterestIssueItem = Omit<
  IssueSummary,
  "firstEventAt" | "lastEventAt" | "lastEvent"
> & {
  firstEventAt: string | null;
  lastEventAt: string | null;
  lastEvent: IssueSummary["lastEvent"] | null;
  interestedAt: string;
};

/**
 * A23 관심 이슈 저장. 이미 저장한 이슈를 또 저장해도 같은 응답이다.
 * 없는 이슈는 404 ISSUE_NOT_FOUND, 손님은 401 UNAUTHORIZED
 */
export function addInterestIssue(issueId: number) {
  return api
    .put<InterestIssueState>(`/members/me/interest-issues/${issueId}`)
    .then((res) => res.data);
}

/** A24 관심 이슈 해제. 저장하지 않은 이슈를 빼도 200 이다. 손님은 401 UNAUTHORIZED */
export function removeInterestIssue(issueId: number) {
  return api
    .delete<InterestIssueState>(`/members/me/interest-issues/${issueId}`)
    .then((res) => res.data);
}

/** A25 관심 이슈 목록 — 저장한 이슈 전부, 쪽을 나누지 않는다. 저장한 시각 최신순, 같으면 이슈 id 내림차순. 손님은 401 */
export function fetchInterestIssues() {
  return api
    .get<ItemList<InterestIssueItem>>("/members/me/interest-issues")
    .then((res) => res.data.items);
}

export const interestIssuesQuery = queryOptions({
  queryKey: ["members", "me", "interest-issues"],
  queryFn: fetchInterestIssues,
});
