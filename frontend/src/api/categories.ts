import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { ItemList } from "@/api/types";

/** A1 카테고리 (docs/api-screen.md A1). `code` 는 URL 에 쓰는 소문자 식별자다 */
export type Category = {
  code: string;
  name: string;
  issueCount: number;
  articleCount: number;
};

export function fetchCategories() {
  return api
    .get<ItemList<Category>>("/categories")
    .then((res) => res.data.items);
}

export const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: fetchCategories,
});

/**
 * A1 에는 없지만 화면이 A1 분야 뒤에 덧붙이는 준비 중 분야 두 개 (프로토타입 v21).
 * 누르면 「…는 준비 중이에요」를 안내한다 (EXPERIENCE.md State Patterns). 팀 확인이 남았다 (EXPERIENCE.md 아직 정하지 않은 것)
 */
export const UPCOMING_CATEGORIES = [
  { code: "sports", name: "스포츠" },
  { code: "culture", name: "문화/연예" },
] as const;
