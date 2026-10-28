import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { ArticleSummary, EventRef, IssueRef } from "@/api/types";

/** 이 기사를 사건으로 묶는 작업의 상태. NO_EVENT 는 대표 사건이 없어 사건으로 묶지 않는 기사다 */
export type EventMatchStatus =
  "NONE" | "QUEUED" | "SUCCEEDED" | "FAILED" | "NO_EVENT";

/** A8 기사 상세 (docs/api-screen.md A8). 기사 요약에 아래를 더한다. 본문은 주지 않는다 */
export type ArticleDetail = ArticleSummary & {
  /** 기자 이름 */
  reporter: string | null;
  /** 「사건을 찾는 중」과 「묶이지 않음」을 가른다 */
  eventMatchStatus: EventMatchStatus;
  /** 속한 사건. 이슈 화면에서 이 사건을 강조한다 */
  event: EventRef | null;
  /** 속한 이슈. eventMatchStatus 가 SUCCEEDED 인데 null 이면 아직 이슈로 묶이지 않은 기사다 */
  issue: IssueRef | null;
};

/** A8 — 없거나 공개 전 기사는 404 ARTICLE_NOT_FOUND */
export function fetchArticle(articleId: number) {
  return api
    .get<ArticleDetail>(`/articles/${articleId}`)
    .then((res) => res.data);
}

export const articleQuery = (articleId: number) =>
  queryOptions({
    queryKey: ["article", articleId],
    queryFn: () => fetchArticle(articleId),
  });
