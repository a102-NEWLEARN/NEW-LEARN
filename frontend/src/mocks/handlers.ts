import { http, HttpResponse } from "msw/http";
import type { Category } from "@/api/categories";
import type { IssueSummary } from "@/api/issues";
import type { Member } from "@/api/members";
import type { SearchResult } from "@/api/search";
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

// 이슈마다 가장 최근 사건의 이름 · 키워드 (지어낸 것). 12번은 docs/api-screen.md A2 예시다
const lastEvents: Record<number, { title: string; label: string }> = {
  21: { title: "여야, 예산안 수정 협의 재개", label: "협의 재개" },
  22: { title: "공천 심사 결과 발표 연기", label: "발표 연기" },
  31: { title: "의대 증원 규모 재조정안 공개", label: "재조정안" },
  32: { title: "피해 지원 특별법 개정안 통과", label: "개정안 통과" },
  12: { title: "텍사스 공장 엔지니어 수급 우려 보도", label: "인력 수급 우려" },
  13: { title: "한국은행, 기준금리 연 2.50% 유지", label: "금리 유지" },
  14: { title: "스트레스 DSR 2단계 시행", label: "DSR 시행" },
  15: { title: "외환당국 구두 개입 시사", label: "구두 개입" },
  41: { title: "휴전 연장 합의안 초안 공개", label: "합의안 초안" },
  51: { title: "국산 거대 언어 모델 공개 시연", label: "공개 시연" },
  52: { title: "저궤도 위성 서비스 요금제 발표", label: "요금제 발표" },
};

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
    // 12번은 docs/api-screen.md A2 예시 요약. 나머지는 요약이 없다
    summary:
      id === 12 ? "한빛반도체가 텍사스 공장 투자를 늘리고 착공했다" : null,
    categories: [{ code: category.code, name: category.name }],
    eventCount: 4,
    articleCount: 12,
    publisherCount: 4,
    firstEventAt,
    lastEventAt,
    createdAt: firstEventAt,
    lastEvent: { id: id * 10, ...lastEvents[id], occurredAt: lastEventAt },
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

// A17 — docs/api-screen.md A17 예시. 가짜 API 에서는 늘 로그인한 회원이다.
// 손님 화면은 테스트에서 401 로 바꿔 본다
const me: Member = {
  id: 7,
  loginId: "newlearn01",
  name: "김뉴런",
  categories: [
    { code: "economy", name: "경제" },
    { code: "it_science", name: "IT·과학" },
  ],
};

// 오류 응답 — Problem Details + code (docs/api.md 2절)
function problem(
  status: number,
  code: string,
  detail: string,
  instance: string,
) {
  return HttpResponse.json(
    { type: "about:blank", title: code, status, detail, instance, code },
    { status },
  );
}

// A2 정렬 기준. 같으면 id 내림차순 (docs/api-screen.md A2)
const ISSUE_SORTS = ["lastEventAt", "createdAt"] as const;

// A13 검색용 가짜 기사 — 위 가짜 이슈들과 어울리게 지어냈다. 기사 목록(A7) 가짜가 생기면 그쪽과 합친다
const articles = [
  {
    id: 401,
    title: "한빛반도체, 텍사스 공장 착공식 열어",
    summary:
      "한빛반도체가 텍사스주에서 반도체 공장 착공식을 열고 투자 규모를 밝혔다",
  },
  {
    id: 402,
    title: "美 공장 인력난에 국내 엔지니어 파견 검토",
    summary: "현지 숙련 인력이 모자라 국내 엔지니어를 보내는 방안을 검토한다",
  },
  {
    id: 403,
    title: "한국은행, 기준금리 연 2.50% 동결",
    summary: "물가와 가계부채를 함께 고려해 금리를 묶었다",
  },
  {
    id: 404,
    title: "원/달러 환율 1,500원 넘어… 외환당국 구두 개입",
    summary: "외환당국이 시장 쏠림을 경계한다며 구두 개입에 나섰다",
  },
  {
    id: 405,
    title: "여야, 내년 예산안 수정 협의 재개",
    summary: "법정 처리 시한을 앞두고 여야가 다시 마주 앉았다",
  },
  {
    id: 406,
    title: "의대 증원 재조정안 공개… 의료계 반발",
    summary: "정부가 내년도 의대 정원 조정안을 내놓자 의료계가 반발했다",
  },
  {
    id: 407,
    title: "중동 휴전 연장 합의안 초안 공개",
    summary: "중재국이 휴전을 연장하는 합의안 초안을 공개했다",
  },
  {
    id: 408,
    title: "국산 거대 언어 모델 AI 공개 시연",
    summary: "국내 기업이 직접 만든 거대 언어 모델을 처음 공개 시연했다",
  },
];

// A13 — 우리가 가진 뉴스 데이터 가운데 검색어가 들어간 것 (2026-10-23 사용자가 정한 규칙).
// 이슈 · 사건은 이름, 기사는 제목이나 요약에 들어 있으면 준다. 영문은 대소문자를 가리지 않는다.
// 진짜 검색 규칙은 백엔드 A13(Jira 43, 보류)이 정한다
function search(q: string): SearchResult {
  const word = q.trim().toLowerCase();
  const has = (...texts: (string | null)[]) =>
    word.length > 0 && texts.some((text) => text?.toLowerCase().includes(word));
  return {
    issues: issues
      .filter((issue) => has(issue.title))
      .map(({ id, title }) => ({ id, title })),
    events: issues
      .filter((issue) => has(issue.lastEvent.title))
      .map(({ id, lastEvent }) => ({
        id: lastEvent.id,
        title: lastEvent.title,
        issueId: id,
      })),
    articles: articles
      .filter((article) => has(article.title, article.summary))
      .map(({ id, title }) => ({ id, title })),
  };
}

export const handlers = [
  http.get("/api/v1/categories", () =>
    HttpResponse.json({ items: categories } satisfies ItemList<Category>),
  ),
  // 분야(category)로 거르고 sort 순서로 준다. 기본은 마지막 사건 최신순.
  // 없는 분야는 404, 모르는 sort 값은 400 (docs/api-screen.md A2)
  http.get("/api/v1/issues", ({ request }) => {
    const params = new URL(request.url).searchParams;
    const code = params.get("category");
    const sort = params.get("sort") ?? "lastEventAt";
    const page = Number(params.get("page") ?? 0);
    const size = Number(params.get("size") ?? 20);
    if (code && !categories.some((category) => category.code === code)) {
      return problem(
        404,
        "CATEGORY_NOT_FOUND",
        `카테고리를 찾을 수 없다: ${code}`,
        "/api/v1/issues",
      );
    }
    const key = ISSUE_SORTS.find((item) => item === sort);
    if (!key) {
      return problem(
        400,
        "VALIDATION_FAILED",
        `모르는 정렬 기준: ${sort}`,
        "/api/v1/issues",
      );
    }
    const matched = issues
      .filter((item) => !code || item.categories.some((c) => c.code === code))
      .sort((a, b) => b[key].localeCompare(a[key]) || b.id - a.id);
    return HttpResponse.json({
      items: matched.slice(page * size, (page + 1) * size),
      page,
      size,
      totalElements: matched.length,
      totalPages: Math.ceil(matched.length / size),
    } satisfies Page<IssueSummary>);
  }),
  http.get("/api/v1/members/me", () => HttpResponse.json(me)),
  http.get("/api/v1/search", ({ request }) =>
    HttpResponse.json(search(new URL(request.url).searchParams.get("q") ?? "")),
  ),
];
