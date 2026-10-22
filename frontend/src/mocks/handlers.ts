import { http, HttpResponse } from "msw/http";
import type { Category } from "@/api/categories";
import type { ItemList } from "@/api/types";

// 가짜 API — 백엔드 API 가 생길 때까지 화면 개발 · 테스트에 쓴다 (frontend/README.md 「가짜 API」)
// 응답 모양은 docs/api-screen.md 예시를 따른다. 값은 지어낸 것이다

// A1 — 코드 · 이름은 docs/data-model.md 2절의 다섯 개(제안), 순서는 docs/mvp-overview.md 2-1.
// 이슈 · 기사 개수는 가짜 값이다
const categories: Category[] = [
  { code: "politics", name: "정치", issueCount: 2, articleCount: 840 },
  { code: "society", name: "사회", issueCount: 2, articleCount: 910 },
  { code: "economy", name: "경제", issueCount: 3, articleCount: 1520 },
  { code: "world", name: "국제", issueCount: 1, articleCount: 620 },
  { code: "it_science", name: "IT·과학", issueCount: 2, articleCount: 730 },
];

export const handlers = [
  http.get("/api/v1/categories", () =>
    HttpResponse.json({ items: categories } satisfies ItemList<Category>),
  ),
];
