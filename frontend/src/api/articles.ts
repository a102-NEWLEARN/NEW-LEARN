import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { ArticleSummary, Page } from "@/api/types";

export type ArticlesParams = {
  /** 이 대표 분야의 기사만. 없으면 전체. 없는 코드는 404 CATEGORY_NOT_FOUND */
  category?: string;
  page?: number;
  /** 1 ~ 100. 없으면 20 */
  size?: number;
};

/** A7 최신 기사 (docs/api-screen.md A7). 발행 시각 최신순, 같으면 id 내림차순 */
export function fetchArticles(params: ArticlesParams = {}) {
  return api
    .get<Page<ArticleSummary>>("/articles", { params })
    .then((res) => res.data);
}

export const articlesQuery = (params: ArticlesParams = {}) =>
  queryOptions({
    queryKey: ["articles", params],
    queryFn: () => fetchArticles(params),
  });
