import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api/client";

/**
 * 메인 흐름 · 서브 흐름 — 사건의 역할로 나눈다. 상황을 바꾸는 행위(발생 · 결정 · 발표 · 결과 · 공식 조치)는 MAIN,
 * 다른 사건에 대한 반응 · 평가 · 여론은 SUB. 늘 값이 있다 (docs/api-screen.md A4, Jira 130)
 */
export type TimelineLane = "MAIN" | "SUB";

/** 발생 시점을 본문에서 뽑았나(EXTRACTED) · 첫 기사 발행 시각으로 채웠나(FIRST_PUBLISHED) */
export type OccurredAtBasis = "EXTRACTED" | "FIRST_PUBLISHED";

/** A4 타임라인의 사건 하나. 시각은 오프셋이 붙은 문자열이다 */
export type TimelineEvent = {
  id: number;
  title: string;
  /** 점 옆에 보이는 짧은 키워드 */
  label: string;
  lane: TimelineLane;
  occurredAt: string;
  occurredAtBasis: OccurredAtBasis;
  articleCount: number;
  publisherCount: number;
};

/** A4 — 이슈의 사건을 페이지 없이 한 번에. occurredAt · id 오름차순 */
export type Timeline = { issueId: number; events: TimelineEvent[] };

/** A4 — 없는 이슈는 404 ISSUE_NOT_FOUND, 사건이 0개면 빈 목록 */
export function fetchTimeline(issueId: number) {
  return api
    .get<Timeline>(`/issues/${issueId}/timeline`)
    .then((res) => res.data);
}

export const timelineQuery = (issueId: number) =>
  queryOptions({
    queryKey: ["issue", issueId, "timeline"],
    queryFn: () => fetchTimeline(issueId),
  });
