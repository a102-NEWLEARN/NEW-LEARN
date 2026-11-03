import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { OccurredAtBasis } from "@/api/timeline";
import type { EventRef, PublisherRef } from "@/api/types";

/** A5 사건 패널 (docs/api-screen.md A5) */
export type EventDetail = EventRef & {
  /** 저장된 사건 요약(AI 생성). 없으면 null */
  summary: string | null;
  occurredAtBasis: OccurredAtBasis;
  /** 속한 이슈. null 이면 아직 이슈로 묶이지 않은 사건 */
  issue: { id: number; title: string } | null;
  articleCount: number;
  /** 이 사건을 보도한 언론사 전부. code 오름차순 */
  publishers: PublisherRef[];
  /** 같은 이슈 안에서 A4 와 같은 순서의 앞 · 뒤 사건 */
  previousEvent: EventRef | null;
  nextEvent: EventRef | null;
};

/** A5 — 없는 사건은 404 EVENT_NOT_FOUND */
export function fetchEvent(eventId: number) {
  return api.get<EventDetail>(`/events/${eventId}`).then((res) => res.data);
}

export const eventQuery = (eventId: number) =>
  queryOptions({
    queryKey: ["event", eventId],
    queryFn: () => fetchEvent(eventId),
  });
