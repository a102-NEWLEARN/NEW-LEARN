import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api/client";

/**
 * 가지 종류 — 핵심 내용 · 원인·배경 · 반응 · 전망 (docs/mvp-overview.md F03).
 * 가지 이름 글자는 보기마다 달라서 화면이 정한다 (docs/api-screen.md 3절)
 */
export type BranchType = "CORE" | "CAUSE" | "REACTION" | "OUTLOOK";

/** 가지 하나. 잎은 한 개 이상이고 워커가 보낸 순서 그대로다. CORE 의 첫 잎이 이 기사의 대표 사건이다 */
export type MindmapBranch = {
  type: BranchType;
  items: { text: string }[];
};

/** A9 기사 마인드맵 (docs/api-screen.md A9). 흐름지도 · 마인드맵 두 보기가 같은 응답을 쓴다 */
export type Mindmap = {
  articleId: number;
  /** 응답 모양의 판. 화면이 모르는 판이면 그리지 않고 안내만 한다 */
  schemaVersion: string;
  /** AI 가 만든 시각 */
  generatedAt: string;
  /** AI 생성 표시를 붙이라는 신호. 지금은 늘 true */
  aiGenerated: boolean;
  /** 가운데 글자. 지금은 기사 제목이다 */
  title: string;
  /** 내용이 있는 가지만, CORE · CAUSE · REACTION · OUTLOOK 순서로 한 번씩 */
  branches: MindmapBranch[];
};

/**
 * A9 — 없거나 공개 전 기사는 404 ARTICLE_NOT_FOUND, 결과가 없으면 404 MINDMAP_NOT_FOUND.
 * MINDMAP_NOT_FOUND 면 A8 의 mindmapStatus 로 「분석 중」인지 가른다
 */
export function fetchMindmap(articleId: number) {
  return api
    .get<Mindmap>(`/articles/${articleId}/mindmap`)
    .then((res) => res.data);
}

export const mindmapQuery = (articleId: number) =>
  queryOptions({
    queryKey: ["article", articleId, "mindmap"],
    queryFn: () => fetchMindmap(articleId),
  });
