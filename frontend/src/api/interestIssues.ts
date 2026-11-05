import { type QueryClient, queryOptions } from "@tanstack/react-query";
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

// 받아 둔 응답 하나에서 이 이슈의 interested 를 바꾼다. 이슈 머리(A3)는 그 자체, 이슈 목록(A2)은 items 안에 있다.
// 모양이 다른 응답(타임라인 등)은 그대로 둔다
function patchIssue(
  value: unknown,
  issueId: number,
  interested: boolean,
): unknown {
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  if (record.id === issueId && typeof record.interested === "boolean") {
    return record.interested === interested ? value : { ...record, interested };
  }
  const list: unknown = record.items;
  if (Array.isArray(list)) {
    const items = list.map((item: unknown) =>
      patchIssue(item, issueId, interested),
    );
    return items.some((item, index) => item !== list[index])
      ? { ...record, items }
      : value;
  }
  return value;
}

/**
 * 별을 누른 뒤 받아 둔 이슈 응답 — 이슈 머리(A3) · 이슈 목록(A2: 홈 추천 · 사이드바) — 에서 이 이슈의 interested 를
 * 응답대로 바꾼다. 다시 받지 않는다. 관심 이슈 목록(A25)은 들고 나는 이슈가 달라져서 새로 받게 한다 (북마크의 setBookmarked 와 같은 꼴)
 */
export function setInterested(
  queryClient: QueryClient,
  issueId: number,
  interested: boolean,
) {
  // 이슈 머리는 그 키만(exact) — 타임라인(["issue", id, "timeline"])까지 걸지 않는다.
  // 바뀐 응답에만 setQueryData 한다. 같은 값을 넣어도 TanStack 은 그 쿼리를 「방금 받음」으로 바꿔서,
  // 무효로 해 둔 다른 목록이 다시 받지 않게 될 수 있다
  const cached = [
    ...queryClient.getQueriesData({
      queryKey: ["issue", issueId],
      exact: true,
    }),
    ...queryClient.getQueriesData({ queryKey: ["issues"] }),
  ];
  for (const [queryKey, data] of cached) {
    const next = patchIssue(data, issueId, interested);
    if (next !== data) queryClient.setQueryData(queryKey, next);
  }
  void queryClient.invalidateQueries({
    queryKey: interestIssuesQuery.queryKey,
  });
}
