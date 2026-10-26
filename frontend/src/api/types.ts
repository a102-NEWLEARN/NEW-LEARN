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
