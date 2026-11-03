import { infiniteQueryOptions } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { ArticleSummary, Page } from "@/api/types";

/** 홈 최신 기사가 처음 보이고 *더 보기* 마다 더 붙이는 기사 수 (EXPERIENCE.md IA 홈 행) */
export const LATEST_ARTICLES_SIZE = 8;

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

// *더 보기* 마다 다음 쪽을 불러 아래에 붙인다. 쪽은 분야마다 따로 쌓인다
export const articlesQuery = (category?: string) =>
  infiniteQueryOptions({
    queryKey: ["articles", { category }],
    queryFn: ({ pageParam }) =>
      fetchArticles({ category, page: pageParam, size: LATEST_ARTICLES_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.page + 1 < last.totalPages ? last.page + 1 : undefined,
  });
