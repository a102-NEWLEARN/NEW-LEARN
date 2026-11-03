import { infiniteQueryOptions } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { ArticleSummary, Page } from "@/api/types";

/** 사건 패널이 처음 보이고 *더 보기* 마다 더 붙이는 기사 수 (EXPERIENCE.md IA 사건 패널 행) */
export const EVENT_ARTICLES_SIZE = 5;

/** A6 — 사건 관련 기사. 발행 시각 · id 오름차순, 공개 전 기사는 빠진다. 없는 사건은 404 EVENT_NOT_FOUND */
export function fetchEventArticles(
  eventId: number,
  page: number,
  size = EVENT_ARTICLES_SIZE,
) {
  return api
    .get<Page<ArticleSummary>>(`/events/${eventId}/articles`, {
      params: { page, size },
    })
    .then((res) => res.data);
}

// *더 보기* 마다 다음 쪽을 불러 아래에 붙인다. 쪽은 사건마다 따로 쌓인다
export const eventArticlesQuery = (eventId: number) =>
  infiniteQueryOptions({
    queryKey: ["event", eventId, "articles"],
    queryFn: ({ pageParam }) => fetchEventArticles(eventId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.page + 1 < last.totalPages ? last.page + 1 : undefined,
  });
