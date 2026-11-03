import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api/client";

/** 검색어 최대 길이 — 넘으면 A13 이 400 이다. 검색 칸이 이만큼만 받는다 */
export const SEARCH_MAX_LENGTH = 50;

/** A13 통합 검색 결과 (docs/api-screen.md A13). 묶음마다 이름만 준다 */
export type SearchResult = {
  /** 누르면 이슈 화면 */
  issues: { id: number; title: string }[];
  /** 누르면 그 이슈의 타임라인에서 그 사건 */
  events: { id: number; title: string; issueId: number }[];
  /** 누르면 기사 마인드맵 */
  articles: { id: number; title: string }[];
};

/**
 * A13 — 제목에 검색어 q 가 들어간 이슈 · 사건 · 기사. 유형마다 최신순 20개까지.
 * q 는 앞뒤 공백을 지우고 1 ~ 50자 — 아니면 400 VALIDATION_FAILED 와 errors[q] 까닭 (docs/api-screen.md A13)
 */
export function fetchSearch(q: string) {
  return api
    .get<SearchResult>("/search", { params: { q } })
    .then((res) => res.data);
}

export const searchQuery = (q: string) =>
  queryOptions({
    queryKey: ["search", q],
    queryFn: () => fetchSearch(q),
  });
