import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api/client";

/** A13 통합 검색 결과 (docs/api-screen.md A13). 묶음마다 이름만 준다 */
export type SearchResult = {
  /** 누르면 이슈 화면 */
  issues: { id: number; title: string }[];
  /** 누르면 그 이슈의 타임라인에서 그 사건 */
  events: { id: number; title: string; issueId: number }[];
  /** 누르면 기사 마인드맵 */
  articles: { id: number; title: string }[];
};

/** A13 — 검색어 q 가 들어간 이슈 · 사건 · 기사. 백엔드는 아직 자리만 있다(Jira 43 보류) */
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
