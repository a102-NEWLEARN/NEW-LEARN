// 목록 응답 모양 — docs/api.md 1절 「목록 응답」

/** 쪽을 나누는 목록. *더 보기* 는 `page + 1 < totalPages` 일 때 보인다 */
export type Page<T> = {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

/** 쪽을 나누지 않는 목록 (카테고리 등) */
export type ItemList<T> = {
  items: T[];
};

// 공통 조각 — docs/api-screen.md 1절

/** 언론사 참조 */
export type PublisherRef = { code: string; name: string };

/** 카테고리 참조 */
export type CategoryRef = { code: string; name: string };

/** 이슈 참조 — 이슈 화면(A3 · A4)을 열 때 */
export type IssueRef = { id: number; title: string };

/** 사건 참조 — 사건 패널(A5)을 열거나 타임라인에서 강조할 때 */
export type EventRef = {
  id: number;
  title: string;
  label: string;
  occurredAt: string;
};

/** 기사 마인드맵 상태. 목록 · 상세의 기사는 사실상 늘 SUCCEEDED 다 */
export type MindmapStatus =
  "NONE" | "QUEUED" | "SUCCEEDED" | "FAILED" | "NOT_ANALYZABLE";

/** 기사 요약 — A6 · A7 · A22 의 항목. 시각은 오프셋이 붙은 문자열이다 */
export type ArticleSummary = {
  id: number;
  title: string;
  publisher: PublisherRef;
  publishedAt: string;
  category: CategoryRef | null;
  /** 우리 AI 요약. 없으면 null — 붙일 때는 AI 생성 표시와 함께 */
  summary: string | null;
  /** *원문 보기* 주소 */
  url: string;
  mindmapStatus: MindmapStatus;
  /** 로그인한 회원이 담았나. 손님이면 false */
  bookmarked: boolean;
};
