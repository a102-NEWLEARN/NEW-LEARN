import { http, HttpResponse } from "msw/http";
import type { Category } from "@/api/categories";
import type { EventDetail } from "@/api/event";
import type { IssueDetail } from "@/api/issue";
import type { IssueSummary } from "@/api/issues";
import type { Member } from "@/api/members";
import type { SearchResult } from "@/api/search";
import type { Timeline, TimelineEvent } from "@/api/timeline";
import type {
  ArticleSummary,
  EventRef,
  ItemList,
  Page,
  PublisherRef,
} from "@/api/types";

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

// A4 — 12번 이슈의 사건. 레인을 정한 사건(MAIN · SUB), 발생 시점을 첫 기사로 채운 사건(FIRST_PUBLISHED),
// 같은 시각에 같은 레인 · 다른 레인 사건을 일부러 넣었다. 마지막 사건이 A2 의 lastEvent 다
const issue12Events: TimelineEvent[] = [
  event(
    113,
    "한빛반도체, 미국 공장 후보지 검토 착수",
    "후보지 검토",
    "MAIN",
    "2026-08-04T00:00:00+09:00",
    "EXTRACTED",
    3,
    2,
  ),
  event(
    114,
    "한빛반도체, 텍사스 공장 투자 확대 공식 발표",
    "공식 발표",
    "MAIN",
    "2026-08-21T00:00:00+09:00",
    "EXTRACTED",
    5,
    3,
  ),
  event(
    115,
    "텍사스 주정부, 세제 혜택 패키지 제시",
    "세제 혜택",
    "SUB",
    "2026-08-21T00:00:00+09:00",
    "FIRST_PUBLISHED",
    2,
    2,
  ),
  event(
    116,
    "현지 주민 설명회에서 용수 사용 우려 제기",
    "용수 우려",
    "SUB",
    "2026-09-02T09:00:00+09:00",
    "FIRST_PUBLISHED",
    2,
    2,
  ),
  event(
    117,
    "미국 정부, 반도체 보조금 지급 확정",
    "보조금 확정",
    "MAIN",
    "2026-09-15T00:00:00+09:00",
    "EXTRACTED",
    6,
    4,
  ),
  event(
    118,
    "한빛반도체 이사회, 추가 투자 승인",
    "추가 투자 승인",
    "MAIN",
    "2026-09-15T00:00:00+09:00",
    "EXTRACTED",
    4,
    3,
  ),
  event(
    119,
    "한빛반도체 텍사스 공장 착공식",
    "착공식",
    "MAIN",
    "2026-10-06T00:00:00+09:00",
    "EXTRACTED",
    5,
    4,
  ),
  event(
    120,
    "텍사스 공장 엔지니어 수급 우려 보도",
    "인력 수급 우려",
    "SUB",
    "2026-10-09T08:41:00+09:00",
    "FIRST_PUBLISHED",
    4,
    2,
  ),
];

function event(
  id: number,
  title: string,
  label: string,
  lane: TimelineEvent["lane"],
  occurredAt: string,
  occurredAtBasis: TimelineEvent["occurredAtBasis"],
  articleCount: number,
  publisherCount: number,
): TimelineEvent {
  return {
    id,
    title,
    label,
    lane,
    occurredAt,
    occurredAtBasis,
    articleCount,
    publisherCount,
  };
}

// 한국 시각 문자열 「2026-09-01T09:00:00+09:00」
function kstIso(ms: number) {
  return `${new Date(ms + 9 * 3600_000).toISOString().slice(0, 19)}+09:00`;
}

// A4 — 12번 밖의 이슈는 첫 사건과 마지막 사건 사이에 고르게 사건 4개. 셋째는 반응 사건(서브 흐름)이다.
// id 는 이슈 id × 10 에서 거꾸로 센다(마지막 사건이 × 10 — A13 검색이 이 id 로 사건을 가리킨다)
function timelineOf(
  id: number,
  title: string,
  firstEventAt: string,
  lastEventAt: string,
): TimelineEvent[] {
  if (id === 12) return issue12Events;
  const first = Date.parse(firstEventAt);
  const step = (Date.parse(lastEventAt) - first) / 3;
  const labels = ["첫 보도", "후속 보도", "각계 반응"];
  return [0, 1, 2, 3].map((at) => {
    const last = at === 3;
    const occurredAt =
      at === 0 ? firstEventAt : last ? lastEventAt : kstIso(first + step * at);
    return event(
      id * 10 - 3 + at,
      last ? lastEvents[id].title : `${title} ${labels[at]}`,
      last ? lastEvents[id].label : labels[at],
      at === 2 ? "SUB" : "MAIN",
      occurredAt,
      "EXTRACTED",
      3,
      2,
    );
  });
}

// A2 — 분야마다 이슈 개수를 위 issueCount 와 맞췄다. 12번은 docs/api-screen.md A2 예시다.
// 사건 · 기사 수와 마지막 사건은 A4 사건 목록(timelineOf)에서 센다
function issue(
  id: number,
  code: string,
  title: string,
  firstEventAt: string,
  lastEventAt: string,
): IssueSummary {
  const category = categories.find((item) => item.code === code)!;
  const events = timelineOf(id, title, firstEventAt, lastEventAt);
  const last = events[events.length - 1];
  return {
    id,
    title,
    // 12번은 docs/api-screen.md A2 예시 요약. 나머지는 요약이 없다
    summary:
      id === 12 ? "한빛반도체가 텍사스 공장 투자를 늘리고 착공했다" : null,
    categories: [{ code: category.code, name: category.name }],
    eventCount: events.length,
    articleCount: events.reduce((sum, item) => sum + item.articleCount, 0),
    publisherCount: 4,
    firstEventAt,
    lastEventAt,
    createdAt: firstEventAt,
    lastEvent: {
      id: last.id,
      title: last.title,
      label: last.label,
      occurredAt: last.occurredAt,
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

// A5 · A6 — 가짜 언론사. 이름은 지어냈다. 앞의 두 곳은 docs/api-screen.md A5 예시다
const presses: PublisherRef[] = [
  { code: "bareun", name: "바른신문" },
  { code: "saebyeok", name: "새벽타임즈" },
  { code: "hanmaeum", name: "한마음일보" },
  { code: "nuri", name: "누리경제" },
  { code: "dongnyeok", name: "동녘방송" },
];

// A5 사건 요약 — 12번 이슈 사건은 지어 두었다. 116번은 요약이 없는(null) 사건이다
const eventSummaries: Record<number, string | null> = {
  113: "한빛반도체가 미국 내 공장 후보지 세 곳을 놓고 검토에 들어갔다고 밝혔다.",
  114: "한빛반도체가 텍사스 공장 투자 규모를 늘린다고 공식 발표했다. 첫 해 생산 목표도 함께 내놨다.",
  115: "텍사스 주정부가 공장 유치를 위해 세금 감면과 기반 시설 지원을 묶은 혜택안을 내놨다.",
  116: null,
  117: "미국 정부가 반도체 지원법에 따라 한빛반도체에 보조금을 주기로 확정했다.",
  118: "한빛반도체 이사회가 텍사스 공장 2단계 투자를 승인했다.",
  119: "한빛반도체가 텍사스주에서 공장 착공식을 열고 양산 일정을 밝혔다.",
  120: "텍사스 공장에 필요한 엔지니어 수를 두고 보도가 엇갈렸다.",
};

type EventEntry = {
  event: TimelineEvent;
  issue: IssueSummary;
  events: TimelineEvent[];
  index: number;
};

// 모든 가짜 이슈의 A4 사건에서 찾는다
function findEvent(eventId: number): EventEntry | undefined {
  for (const issue of issues) {
    const events = timelineOf(
      issue.id,
      issue.title,
      issue.firstEventAt,
      issue.lastEventAt,
    );
    const index = events.findIndex((event) => event.id === eventId);
    if (index >= 0) return { event: events[index], issue, events, index };
  }
  return undefined;
}

const eventRef = (event: TimelineEvent | undefined): EventRef | null =>
  event
    ? {
        id: event.id,
        title: event.title,
        label: event.label,
        occurredAt: event.occurredAt,
      }
    : null;

// 언론사 publisherCount 곳, code 오름차순 (docs/api-screen.md A5)
const publishersOf = (event: TimelineEvent) =>
  presses
    .slice(0, event.publisherCount)
    .sort((a, b) => a.code.localeCompare(b.code));

// A6 — 사건마다 기사 articleCount 건. 첫 기사는 사건 시각에, 다음은 세 시간씩 뒤에 나왔다고 지었다.
// 119번 사건의 마지막 기사는 마인드맵 분석 중(QUEUED)이다
const ARTICLE_ANGLES = [
  "",
  "후속 보도",
  "현장 분위기",
  "전문가 분석",
  "쟁점 정리",
  "관계자 반응",
];
function articlesOf({ event, issue }: EventEntry): ArticleSummary[] {
  const publishers = publishersOf(event);
  return Array.from({ length: event.articleCount }, (_, at) => {
    const id = event.id * 100 + at + 1;
    return {
      id,
      title:
        at === 0
          ? event.title
          : `${event.title} — ${ARTICLE_ANGLES[at % ARTICLE_ANGLES.length] || "추가 보도"}`,
      publisher: publishers[at % publishers.length],
      publishedAt: kstIso(Date.parse(event.occurredAt) + at * 3 * 3_600_000),
      category: issue.categories[0] ?? null,
      summary: at === 0 ? (eventSummaries[event.id] ?? null) : null,
      url: `https://news.example.com/articles/${id}`,
      mindmapStatus:
        event.id === 119 && at === event.articleCount - 1
          ? "QUEUED"
          : "SUCCEEDED",
      bookmarked: false,
    };
  });
}

function eventNotFound(instance: string) {
  return problem(404, "EVENT_NOT_FOUND", "사건을 찾을 수 없다", instance);
}

function issueNotFound(instance: string) {
  return problem(404, "ISSUE_NOT_FOUND", "이슈를 찾을 수 없다", instance);
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
  // A3 — A2 항목에서 lastEvent 만 뺀 모양. 없는 이슈는 404 (docs/api-screen.md A3)
  http.get("/api/v1/issues/:issueId", ({ params }) => {
    const found = issues.find((item) => item.id === Number(params.issueId));
    if (!found) return issueNotFound(`/api/v1/issues/${params.issueId}`);
    const { id, title, summary, eventCount, articleCount, publisherCount } =
      found;
    const { categories, firstEventAt, lastEventAt, createdAt } = found;
    return HttpResponse.json({
      id,
      title,
      summary,
      categories,
      eventCount,
      articleCount,
      publisherCount,
      firstEventAt,
      lastEventAt,
      createdAt,
    } satisfies IssueDetail);
  }),
  // A4 — 그 이슈의 사건 전부. 없는 이슈는 404 (docs/api-screen.md A4)
  http.get("/api/v1/issues/:issueId/timeline", ({ params }) => {
    const found = issues.find((item) => item.id === Number(params.issueId));
    if (!found)
      return issueNotFound(`/api/v1/issues/${params.issueId}/timeline`);
    return HttpResponse.json({
      issueId: found.id,
      events: timelineOf(
        found.id,
        found.title,
        found.firstEventAt,
        found.lastEventAt,
      ),
    } satisfies Timeline);
  }),
  // A5 — 사건 패널. 없는 사건은 404 (docs/api-screen.md A5)
  http.get("/api/v1/events/:eventId", ({ params }) => {
    const found = findEvent(Number(params.eventId));
    if (!found) return eventNotFound(`/api/v1/events/${params.eventId}`);
    const { event, issue, events, index } = found;
    return HttpResponse.json({
      ...eventRef(event)!,
      summary:
        event.id in eventSummaries
          ? eventSummaries[event.id]
          : `「${event.title}」를 다룬 보도를 묶은 사건이다.`,
      occurredAtBasis: event.occurredAtBasis,
      issue: { id: issue.id, title: issue.title },
      articleCount: event.articleCount,
      publishers: publishersOf(event),
      previousEvent: eventRef(events[index - 1]),
      nextEvent: eventRef(events[index + 1]),
    } satisfies EventDetail);
  }),
  // A6 — 사건 관련 기사. 발행 시각 오름차순, 쪽을 나눈다 (docs/api-screen.md A6)
  http.get("/api/v1/events/:eventId/articles", ({ params, request }) => {
    const found = findEvent(Number(params.eventId));
    if (!found)
      return eventNotFound(`/api/v1/events/${params.eventId}/articles`);
    const query = new URL(request.url).searchParams;
    const page = Number(query.get("page") ?? 0);
    const size = Number(query.get("size") ?? 20);
    const all = articlesOf(found);
    return HttpResponse.json({
      items: all.slice(page * size, (page + 1) * size),
      page,
      size,
      totalElements: all.length,
      totalPages: Math.ceil(all.length / size),
    } satisfies Page<ArticleSummary>);
  }),
  http.get("/api/v1/members/me", () => HttpResponse.json(me)),
  http.get("/api/v1/search", ({ request }) =>
    HttpResponse.json(search(new URL(request.url).searchParams.get("q") ?? "")),
  ),
];
