import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { ArticleSummary, Page } from "@/api/types";

/** 홈 최신 기사 한 쪽의 기사 수 (EXPERIENCE.md IA 홈 행) */
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

// 홈 최신 기사 한 쪽(0 부터) — 쪽 번호마다 A7 을 그 쪽으로 받는다 (2026-11-13 사용자, Jira 203)
export const articlesQuery = (category: string | undefined, page: number) =>
  queryOptions({
    queryKey: ["articles", { category, page }],
    queryFn: () =>
      fetchArticles({ category, page, size: LATEST_ARTICLES_SIZE }),
  });
