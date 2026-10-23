import { http, HttpResponse } from "msw/http";
import type { Category } from "@/api/categories";
import type { IssueSummary } from "@/api/issues";
import type { ItemList, Page } from "@/api/types";

// 가짜 API — 백엔드 API 가 생길 때까지 화면 개발 · 테스트에 쓴다 (frontend/README.md 「가짜 API」)
// 응답 모양은 docs/api-screen.md 예시를 따른다. 값은 지어낸 것이다

// A1 — 코드 · 이름은 docs/data-model.md 2절의 다섯 개(제안), 순서는 docs/mvp-overview.md 2-1.
// 이슈 · 기사 개수는 가짜 값이다
const categories: Category[] = [
  { code: "politics", name: "정치", issueCount: 2, articleCount: 840 },
  { code: "society", name: "사회", issueCount: 2, articleCount: 910 },
  { code: "economy", name: "경제", issueCount: 4, articleCount: 1520 },
  { code: "world", name: "국제", issueCount: 1, articleCount: 620 },
  { code: "it_science", name: "IT·과학", issueCount: 2, articleCount: 730 },
];

// A2 — 분야마다 이슈 개수를 위 issueCount 와 맞췄다. 12번은 docs/api-screen.md A2 예시다
function issue(
  id: number,
  code: string,
  title: string,
  firstEventAt: string,
  lastEventAt: string,
): IssueSummary {
  const category = categories.find((item) => item.code === code)!;
  return {
    id,
    title,
    summary: null,
    categories: [{ code: category.code, name: category.name }],
    eventCount: 4,
    articleCount: 12,
    publisherCount: 4,
    firstEventAt,
    lastEventAt,
    createdAt: firstEventAt,
    lastEvent: {
      id: id * 10,
      title: `${title} 최근 사건`,
      label: "최근 사건",
      occurredAt: lastEventAt,
    },
  };
}

const issues: IssueSummary[] = [
  issue(
    21,
    "politics",
    "국회 예산안 처리",
    "2026-09-01T09:00:00+09:00",
    "2026-10-20T10:00:00+09:00",
  ),
  issue(
    22,
    "politics",
    "지방선거 공천 갈등",
    "2025-11-12T09:00:00+09:00",
    "2026-02-03T10:00:00+09:00",
  ),
  issue(
    31,
    "society",
    "의대 정원 조정",
    "2026-03-04T09:00:00+09:00",
    "2026-10-18T10:00:00+09:00",
  ),
  issue(
    32,
    "society",
    "수도권 전세 사기 대책",
    "2025-06-20T09:00:00+09:00",
    "2025-12-01T10:00:00+09:00",
  ),
  issue(
    12,
    "economy",
    "한빛반도체 미국 공장 건설",
    "2026-08-04T00:00:00+09:00",
    "2026-10-09T08:41:00+09:00",
  ),
  issue(
    13,
    "economy",
    "기준금리 동결 행진",
    "2026-01-15T09:00:00+09:00",
    "2026-10-16T10:00:00+09:00",
  ),
  issue(
    14,
    "economy",
    "가계부채 관리 강화",
    "2025-09-02T09:00:00+09:00",
    "2026-01-20T10:00:00+09:00",
  ),
  // 시작은 2025년인데 마지막 사건이 가장 최근이다 — API 순서(마지막 사건 최신순)와 연도 순서가 엇갈리는 경우
  issue(
    15,
    "economy",
    "원/달러 환율 1,500원 돌파",
    "2025-12-01T09:00:00+09:00",
    "2026-10-23T08:00:00+09:00",
  ),
  issue(
    41,
    "world",
    "중동 휴전 협상",
    "2026-05-10T09:00:00+09:00",
    "2026-10-21T10:00:00+09:00",
  ),
  issue(
    51,
    "it_science",
    "소버린 AI 경쟁",
    "2026-02-11T09:00:00+09:00",
    "2026-10-22T10:00:00+09:00",
  ),
  issue(
    52,
    "it_science",
    "위성 인터넷 국내 상용화",
    "2025-10-05T09:00:00+09:00",
    "2026-03-14T10:00:00+09:00",
  ),
];

export const handlers = [
  http.get("/api/v1/categories", () =>
    HttpResponse.json({ items: categories } satisfies ItemList<Category>),
  ),
  // 분야(category)로 거르고 마지막 사건 최신순으로 준다. 없는 분야는 404 (docs/api-screen.md A2)
  http.get("/api/v1/issues", ({ request }) => {
    const params = new URL(request.url).searchParams;
    const code = params.get("category");
    const page = Number(params.get("page") ?? 0);
    const size = Number(params.get("size") ?? 20);
    if (code && !categories.some((category) => category.code === code)) {
      return HttpResponse.json(
        {
          type: "about:blank",
          title: "Not Found",
          status: 404,
          detail: `카테고리를 찾을 수 없다: ${code}`,
          instance: "/api/v1/issues",
          code: "CATEGORY_NOT_FOUND",
        },
        { status: 404 },
      );
    }
    const matched = issues
      .filter((item) => !code || item.categories.some((c) => c.code === code))
      .sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt));
    return HttpResponse.json({
      items: matched.slice(page * size, (page + 1) * size),
      page,
      size,
      totalElements: matched.length,
      totalPages: Math.ceil(matched.length / size),
    } satisfies Page<IssueSummary>);
  }),
];
