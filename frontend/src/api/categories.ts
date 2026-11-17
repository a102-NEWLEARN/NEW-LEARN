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
