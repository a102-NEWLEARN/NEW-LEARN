# 화면용 API 상세 (v1)

화면이 부르는 A1 ~ A9 · A13 ~ A19 의 인자 · 응답 필드 · 예시다. 공통 규칙 · 오류 코드 · 엔드포인트 목록은 `docs/api.md`, 테이블은 `docs/data-model.md`.
A10 ~ A12 는 사용자 URL 분석이 쓰던 번호다. 2026-10-20 팀 회의로 MVP 에서 빼서 비워 둔다.

표 읽는 법

- **타입**: `number` · `string` · `boolean` · `시각`(ISO 8601 + `+09:00` 문자열) · `enum`(정해진 값 중 하나) · `object` · `array`. 「· null」은 값이 없을 수 있다는 뜻이다
- **용도**: 화면 어디에 쓰나
- **어디서**: `테이블.칸` 은 그 칸을 그대로 준다. 「계산」은 조회할 때 셈한다. 투입 전 기사는 모든 계산에서 뺀다(`api.md` 1절)

---

## 1. 공통 조각

여러 응답에 같은 모양으로 들어가는 묶음이다. 아래 표에서는 이름만 적는다.

카테고리 참조 — `{ code, name }`

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `code` | enum | 링크 · 필터에 쓰는 코드(`economy` 등 5개) | `category.code` |
| `name` | string | 화면에 보이는 이름(경제) | `category.name` |

언론사 참조 — `{ code, name }`

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `code` | string | 언론사를 가르는 코드. 같은 언론사가 소스마다 다르게 적혀 와도 한 코드다 | `press.code` |
| `name` | string | 화면에 보이는 언론사 이름 | `press.name` |

이슈 참조 — `{ id, title }`

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `id` | number | 이슈 화면(A3 · A4)을 열 때 쓴다 | `issue.id` |
| `title` | string | 링크 글자 | `issue.title` |

사건 참조 — `{ id, title, label, occurredAt }`

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `id` | number | 사건 패널(A5)을 열거나 타임라인에서 강조할 때 | `event.id` |
| `title` | string | 사건 이름. 사건 패널 제목 · 링크 글자 | `event.title` |
| `label` | string | 사건 키워드(「첫 목격」). 타임라인 점 · 「최근 · 첫 목격」 같은 짧은 표시 | `event.label` |
| `occurredAt` | 시각 | 「10.06 착공식」 같은 날짜 표시 | `event.occurred_at` |

기사 요약 — A6 · A7 의 항목, A8 의 바탕

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `id` | number | 기사 마인드맵(A8 · A9)을 열 때. 목록과 상세가 같은 ID (Jira 42) | `article.id` |
| `title` | string | 기사 제목 | `article.title` |
| `publisher` | 언론사 참조 | 언론사. 모든 기사 화면에 보인다(PRD FR-2) | `article.press_code` → `press` |
| `publishedAt` | 시각 | 발행 시각 표시 · 정렬 | `article.published_at` |
| `category` | 카테고리 참조 · null | 기사의 대표 카테고리 표시. 맞추지 못한 기사는 null | `article.category_code` → `category` |
| `summary` | string · null | 목록의 한두 줄 요약(우리 AI). AI 생성 표시를 붙인다. 분석 전이거나 우리 요약을 끈 동안은 null. NewsData 요약으로 대신할지는 구독 뒤 정한다(`data-model.md` 5절 16번) | `article_mindmap.summary` |
| `url` | string | *원문 보기* 링크 | `article.url` |
| `mindmapStatus` | enum | *마인드맵 보기* 를 켤지 · 「분석 중」을 보일지 | 계산 (`api-internal.md` 6절) — `NONE` · `QUEUED` · `SUCCEEDED` · `FAILED` |

회원 정보 — A15 · A17 · A18 의 응답. A14 응답도 같은 모양

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `id` | number | 회원 ID | `member.id` |
| `loginId` | string | 로그인 아이디 표시 | `member.login_id` |
| `name` | string | 「OO님」 표시 | `member.name` |
| `categories` | array(카테고리 참조) | 관심 분야. 홈 · 마이페이지 관심사 설정에 쓴다 | `member_category` → `category` |

---

## 2. 엔드포인트

### A1. 카테고리 — `GET /api/v1/categories`

카테고리 선택 화면 · 사이드바에 쓴다. 5개를 `sort_order` 순서로 준다. 인자는 없다.

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `items[].code` · `items[].name` | 카테고리 참조 | 카테고리 탭 | `category` |
| `items[].issueCount` | number | 「이 분야의 이슈가 아직 없어요」를 보일지(0이면) | 계산 — 이 카테고리에 걸린 이슈 수 (`issue_category`) |
| `items[].articleCount` | number | 분야별 기사 수 표시 | 계산 — 대표 카테고리가 이것인 투입 기사 수 |

```json
{ "items": [{ "code": "economy", "name": "경제", "issueCount": 3, "articleCount": 1520 }] }
```

### A2. 이슈 목록 — `GET /api/v1/issues`

카테고리별 이슈 목록, 홈 이슈 카드, 검색창 아래 「새로 생성된 이슈」에 쓴다(PRD FR-4, Jira 41).

| 인자 | 타입 | 용도 |
|---|---|---|
| `category` | enum · 선택 | 이 카테고리의 이슈만. 없으면 전체. 없는 코드면 404 `CATEGORY_NOT_FOUND` |
| `sort` | enum · 선택 | `lastEventAt`(기본) — 마지막 사건 발생 시점 최신순(PRD FR-4 가정). `createdAt` — 이슈가 만들어진 최신순, 검색창 아래 「새로 생성된 이슈」(2026-10-20). 같으면 `id` 내림차순. 그 밖의 값이면 400 `VALIDATION_FAILED` |
| `page` · `size` | number · 선택 | 쪽 번호 · 크기 (`api.md` 1절). 검색창 아래는 `size` 로 개수를 정한다(몇 개인지는 미정) |

응답은 목록 모양이고 항목은 아래다. 이슈는 사건 3개가 모여야 생기므로(2026-10-20) 사건 없는 이슈는 없다.

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `id` · `title` | 이슈 참조 | 카드를 누르면 이슈 화면, 카드 제목 | `issue` |
| `summary` | string · null | 카드의 한두 문장(AI 생성) | `issue.summary` |
| `categories` | array(카테고리 참조) | 카드의 분야 표시. 여러 개일 수 있다 | `issue_category` → `category` |
| `eventCount` | number | 「사건 8개」 | 계산 — 이 이슈의 사건 수 |
| `articleCount` | number | 「기사 23개」 | 계산 — 이 이슈 사건들에 묶인 투입 기사 수 (`article_event`) |
| `publisherCount` | number | 「언론사 5곳」 | 계산 — 그 기사들의 언론사(`press_code`) 수 |
| `firstEventAt` · `lastEventAt` | 시각 | 기간 「08.04 ~ 10.09」, 정렬 | 계산 — 사건 `occurred_at` 의 가장 이른 값 · 늦은 값 |
| `createdAt` | 시각 | 「새로 생성된 이슈」 정렬 · 표시 | `issue.created_at` |
| `lastEvent` | 사건 참조 | 카드의 「최근 · 인력 수급 우려」(`label`) | 계산 — `occurred_at` 이 가장 늦은 사건 |

```json
{
  "items": [{
    "id": 12, "title": "한빛반도체 미국 공장 건설", "summary": "한빛반도체가 텍사스 공장 투자를 늘리고 착공했다",
    "categories": [{ "code": "economy", "name": "경제" }],
    "eventCount": 8, "articleCount": 23, "publisherCount": 5,
    "firstEventAt": "2026-08-04T00:00:00+09:00", "lastEventAt": "2026-10-09T08:41:00+09:00",
    "createdAt": "2026-08-21T12:30:00+09:00",
    "lastEvent": { "id": 98, "title": "텍사스 공장 엔지니어 수급 우려 보도", "label": "인력 수급 우려", "occurredAt": "2026-10-09T08:41:00+09:00" }
  }],
  "page": 0, "size": 20, "totalElements": 1, "totalPages": 1
}
```

### A3. 이슈 헤더 — `GET /api/v1/issues/{issueId}`

이슈 화면 맨 위 헤더(PRD FR-20)에 쓴다. 인자는 주소의 `issueId` 하나. 응답은 A2 항목에서 `lastEvent` 만 뺀 모양이고 필드 뜻도 같다. 기간은 `firstEventAt` ~ `lastEventAt` 이다.

### A4. 타임라인 — `GET /api/v1/issues/{issueId}/timeline`

이슈 에볼루션 맵의 사건 노드를 그린다(F07, Jira 48). 이슈의 사건을 페이지 없이 한 번에 준다. 정렬은 `occurredAt` 오름차순, 같으면 `id` 오름차순. 화면은 사건을 **메인 흐름 · 서브 흐름 두 레인**에 놓는다(2026-10-20).

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `issueId` | number | 어느 이슈의 타임라인인지 | 주소의 `issueId` |
| `events[].id` · `title` · `label` · `occurredAt` | 사건 참조 | 점 옆 키워드(`label`)와 가로 위치(발생 시점) | `event` |
| `events[].lane` | enum · null | `MAIN` 메인 흐름 · `SUB` 서브 흐름. 나누는 기준을 정하기 전에는 null(`data-model.md` 5절 11번) | 기준이 정해지면 계산 또는 칸 |
| `events[].occurredAtBasis` | enum | 발생 시점을 본문에서 뽑았나(`EXTRACTED`) · 첫 기사 발행 시각으로 채웠나(`FIRST_PUBLISHED`). 뒤의 것이면 「추정」 표시를 붙일 수 있다 | `event.occurred_at_basis` |
| `events[].articleCount` | number | 점에 마우스를 올리면 보이는 기사 수 | 계산 — 이 사건의 투입 기사 수 |
| `events[].publisherCount` | number | 마우스를 올리면 보이는 언론사 수 | 계산 |
| `relations[]` | array | 사건 사이 선. 화면은 선 종류를 그리지 않기로 해서(2026-10-20) 늘 빈 배열이다. 레인 기준에 사건 관계를 쓰기로 하면 `{ fromEventId, toEventId, type }` 으로 채운다 | `event_relation`(P1) |

새 정보 같은 사건 태그는 그리지 않는다(2026-10-20). 언론사 필터(PRD FR-23)는 P1 이다.

```json
{
  "issueId": 12,
  "events": [{ "id": 91, "title": "한빛반도체, 텍사스 공장 투자 확대 공식 발표", "label": "공식 발표", "lane": null, "occurredAt": "2026-08-21T00:00:00+09:00", "occurredAtBasis": "EXTRACTED", "articleCount": 5, "publisherCount": 3 }],
  "relations": []
}
```

### A5. 사건 패널 — `GET /api/v1/events/{eventId}`

타임라인에서 사건 노드를 누르면 열리는 오른쪽 패널이다(F08, Jira 49). 패널은 사건 요약과 관련 기사(A6)만 보인다(2026-10-20). 아래 필드 중 무엇을 보일지는 FE 가 고른다. 인자는 주소의 `eventId` 하나.

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `id` · `title` · `label` · `occurredAt` | 사건 참조 | 패널 제목 · 날짜 | `event` |
| `summary` | string · null | 사건 요약(AI 생성). 사건 핵심 근거는 보이지 않는다(2026-10-20) | `event.summary` |
| `occurredAtBasis` | enum | A4 와 같다 | `event.occurred_at_basis` |
| `issue` | 이슈 참조 · null | 속한 이슈. null 이면 아직 이슈로 묶이지 않은 사건 | `event.issue_id` → `issue` |
| `articleCount` | number | 「관련 기사 4건」 | 계산 |
| `publishers` | array(언론사 참조) | 이 사건을 보도한 언론사 전부(PRD FR-11). 순서는 아직 정하지 않았다 | 계산 — 투입 기사들의 `press_code` |
| `previousEvent` · `nextEvent` | 사건 참조 · null | *이전 · 다음 사건* 이동. 같은 이슈 안에서 발생 시점 순서로 앞뒤. 없으면 null | 계산 |

관점(PRD FR-24~26, P2)과 이 사건의 변화(F09 · F10)는 빠져 있다.

```json
{
  "id": 98, "title": "텍사스 공장 엔지니어 수급 우려 보도", "label": "인력 수급 우려",
  "summary": "텍사스 공장에 필요한 엔지니어 수를 두고 보도가 엇갈렸다",
  "occurredAt": "2026-10-09T08:41:00+09:00", "occurredAtBasis": "FIRST_PUBLISHED",
  "issue": { "id": 12, "title": "한빛반도체 미국 공장 건설" },
  "articleCount": 4, "publishers": [{ "code": "bareun", "name": "바른신문" }, { "code": "saebyeok", "name": "새벽타임즈" }],
  "previousEvent": { "id": 97, "title": "한빛반도체 텍사스 공장 착공식", "label": "착공식", "occurredAt": "2026-10-06T00:00:00+09:00" },
  "nextEvent": null
}
```

### A6. 사건 관련 기사 — `GET /api/v1/events/{eventId}/articles`

사건 패널의 기사 목록이다(F08).

| 인자 | 타입 | 용도 |
|---|---|---|
| `eventId` | number | 주소. 어느 사건의 기사인지 |
| `page` · `size` | number · 선택 | 화면은 처음 4건(PRD FR-11)을 `size=4` 로 부르고 *더 보기* 에서 다음 쪽을 부른다 |

응답은 목록 모양이고 항목은 기사 요약(1절)이다. 정렬은 발행 시각 오름차순, 같으면 `id` 오름차순. 특정 언론사를 앞세우지 않는다(PRD 4.11).

### A7. 최신 기사 — `GET /api/v1/articles`

홈 · 카테고리의 최신 기사 목록이다(F01, Jira 42). 사건이 1~2개뿐이라 이슈가 없는 기사도 여기서 개별 기사로 보인다.

| 인자 | 타입 | 용도 |
|---|---|---|
| `category` | enum · 선택 | 이 대표 카테고리의 기사만. 없으면 전체 |
| `page` · `size` | number · 선택 | 쪽 번호 · 크기 |

응답은 목록 모양이고 항목은 기사 요약(1절)이다. 정렬은 발행 시각 최신순(PRD FR-2), 같으면 `id` 내림차순. `summary` 가 null 일 때 무엇을 보일지는 FE 질문(`api.md` 4절)이다.

```json
{
  "items": [{
    "id": 456, "title": "한빛반도체 텍사스 공장 첫 삽… \"2028년 양산 변함없다\"",
    "publisher": { "code": "garam", "name": "가람일보" }, "publishedAt": "2026-10-06T10:12:00+09:00",
    "category": { "code": "economy", "name": "경제" },
    "summary": "한빛반도체가 텍사스 공장을 착공했다", "url": "https://news.example.com/a/456",
    "mindmapStatus": "SUCCEEDED"
  }],
  "page": 0, "size": 20, "totalElements": 1, "totalPages": 1
}
```

### A8. 기사 상세 — `GET /api/v1/articles/{articleId}`

기사 마인드맵 화면의 머리와 *이 기사가 속한 이슈 보기*(F11)에 쓴다. 기사 요약(1절)의 필드에 아래를 더한다. 본문(`body`)은 노출 범위(Q3 · Q28)가 정해질 때까지 내보내지 않는다.

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `reporter` | string · null | 기자 이름 | `article.reporter` |
| `eventMatchStatus` | enum | 「사건을 찾는 중」과 「묶이지 않음」을 가른다 — `NONE` · `QUEUED` · `SUCCEEDED` · `FAILED` | 계산 — 이 기사 `MATCH_EVENT` 작업의 상태, 없으면 `NONE` |
| `event` | 사건 참조 · null | 속한 사건. 이슈 화면에서 이 사건을 강조한다(PRD FR-15) | `article_event` → `event` |
| `issue` | 이슈 참조 · null | 속한 이슈. *이 기사가 속한 이슈 보기* 로 A3 · A4 를 연다 | `event.issue_id` → `issue` |

판정이 끝났는데(`eventMatchStatus` 가 `SUCCEEDED`) `issue` 가 null 이면 「아직 이슈로 묶이지 않았다」고 안내한다(PRD FR-30). 이슈는 사건 3개가 모여야 생긴다.

```json
{
  "id": 456, "title": "…", "publisher": { "code": "garam", "name": "가람일보" }, "reporter": "김민정 기자",
  "publishedAt": "2026-10-06T10:12:00+09:00", "url": "https://news.example.com/a/456",
  "category": { "code": "economy", "name": "경제" },
  "summary": "…", "mindmapStatus": "SUCCEEDED", "eventMatchStatus": "SUCCEEDED",
  "event": { "id": 97, "title": "한빛반도체 텍사스 공장 착공식", "label": "착공식", "occurredAt": "2026-10-06T00:00:00+09:00" },
  "issue": { "id": 12, "title": "한빛반도체 미국 공장 건설" }
}
```

### A9. 기사 마인드맵 — `GET /api/v1/articles/{articleId}/mindmap`

기사 하나의 분석 결과를 화면이 두 보기로 그린다(F04, Jira 56) — **흐름지도**(위에서 아래로 읽는 목록)와 **마인드맵**(가운데에서 퍼지는 그림). 둘 다 가제이고 같은 응답을 쓴다. 탭 전환과 화면 구성은 FE 가 맡는다(2026-10-21). 노드 상세 창과 원문 근거 표시는 추후다(F05). 마인드맵이 없으면 404 `MINDMAP_NOT_FOUND`.

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `articleId` | number | 어느 기사의 결과인지 | `article_mindmap.article_id` |
| `schemaVersion` | string | 응답 모양의 버전. 화면이 모르는 버전이면 옛 화면이 깨지지 않게 안내만 한다 | `article_mindmap.schema_version` |
| `generatedAt` | 시각 | 「AI 가 언제 만들었나」 표시 | `article_mindmap.generated_at` |
| `aiGenerated` | boolean | AI 생성 표시를 붙이라는 신호. 지금은 늘 true(PRD FR-7) | 고정값 |
| `title` | string | 가운데 글자. 지금은 기사 제목이다. 나중에 AI 가 지은 제목을 쓸 수 있다 | `content.title` 이 있으면 그것, 없으면 `article.title` |
| `branches` | array | 가지와 잎. 저장한 `content.branches` 에서 근거(`evidence`)를 뺀 모양이다(3절) | `article_mindmap.content` |

```json
{
  "articleId": 456, "schemaVersion": "mindmap-v1", "generatedAt": "2026-10-06T10:13:05+09:00", "aiGenerated": true,
  "title": "한빛반도체 텍사스 공장 첫 삽… \"2028년 양산 변함없다\"",
  "branches": [
    { "type": "CORE", "items": [{ "text": "한빛반도체가 10월 6일 텍사스 공장 착공식을 열었다" }] },
    { "type": "CAUSE", "items": [{ "text": "미국 보조금 조건을 맞추려고 착공을 앞당겼다" }] },
    { "type": "OUTLOOK", "items": [{ "text": "2028년 양산 목표는 그대로라고 밝혔다" }] }
  ]
}
```

### A13. 통합 검색 — `GET /api/v1/search` (자리만)

⌘K 빠른 이동(PRD FR-3, Jira 43)이 부른다. 검색 범위 · 길이 제한 · 유형별 개수는 Jira 43 에서 합의한다. 검색창을 열었을 때 아래에 보이는 「새로 생성된 이슈」는 A2(`sort=createdAt`)로 받는다.

| 인자 · 필드 | 타입 | 용도 |
|---|---|---|
| `q` (인자) | string | 검색어 |
| `issues[]` | 이슈 참조 | 이슈 결과. 누르면 이슈 화면 |
| `events[]` | `{ id, title, issueId }` | 사건 결과. 누르면 그 이슈의 타임라인에서 그 사건 |
| `articles[]` | `{ id, title }` | 기사 결과. 누르면 기사 마인드맵 |

```json
{ "issues": [{ "id": 12, "title": "…" }], "events": [{ "id": 98, "title": "…", "issueId": 12 }], "articles": [{ "id": 456, "title": "…" }] }
```

### A14. 가입 — `POST /api/v1/members`

가입 화면(F12 회원 · 관심 분야, Jira 62)이 부른다. 로그인 없이 부른다. 입력 규칙은 프로토타입 v17 가입 화면을 따랐다(2026-10-21. v17 은 팀 공유 파일이고 저장소 `docs/prototype/` 에는 v15 까지 있다).

| 요청 필드 | 타입 | 용도 · 규칙 |
|---|---|---|
| `loginId` | string | 로그인 아이디. 4자 이상. 쓸 수 있는 글자는 인증 티켓(Jira 62)에서 정한다 |
| `password` | string | 비밀번호. 8자 이상. 서버는 해시만 저장한다(`member.password_hash`) |
| `name` | string | 이름. 비어 있으면 안 된다 |
| `categoryCodes` | array(string) | 관심 분야 코드. 1개 이상, 5개 중에서. 같은 코드가 두 번 오면 하나로 합친다. 없는 코드는 요청 본문 값이라 400 이다(주소 · 인자의 코드가 없을 때만 404) |

| 결과 | 상태 |
|---|---|
| 가입했다 — 회원 정보(1절)를 주고 로그인된 세션을 연다(제안, v17 가입 화면이 가입 뒤 바로 들어간다) | 201, 응답 머리 `Location: /api/v1/members/me` |
| 규칙에 안 맞는다(짧은 아이디 · 비밀번호, 관심 분야 0개, 없는 코드) | 400 `VALIDATION_FAILED` — `errors` 에 칸 |
| 아이디를 이미 누가 쓴다 | 409 `LOGIN_ID_TAKEN` |

### A15. 로그인 — `POST /api/v1/auth/login`

| 요청 필드 | 타입 | 용도 |
|---|---|---|
| `loginId` · `password` | string | 아이디와 비밀번호 |

성공하면 200 과 회원 정보(1절)를 주고 세션 쿠키를 붙인다. 아이디가 없거나 비밀번호가 틀리면 401 `LOGIN_FAILED` 이다 — 둘 중 무엇인지는 알려 주지 않는다. 가입 · 로그인으로 세션을 열 때는 세션 ID 를 새로 발급한다(세션 고정 공격 막기). 쿠키 이름 · 수명 · CSRF 처리, 이미 로그인한 상태에서 A14 · A15 를 부를 때의 동작은 인증 티켓(Jira 62)에서 정하고 사람이 최종 확인한다.

### A16. 로그아웃 — `POST /api/v1/auth/logout`

로그인이 필요하다. 세션을 끝내고 204 를 준다. 세션이 없으면 401 `UNAUTHORIZED`.

### A17. 내 정보 — `GET /api/v1/members/me`

로그인이 필요하다. 회원 정보(1절)를 준다. 홈에서 관심 분야를 먼저 보여 줄 때와 마이페이지 관심사 설정에 쓴다.

```json
{ "id": 7, "loginId": "newlearn01", "name": "김뉴런", "categories": [{ "code": "economy", "name": "경제" }, { "code": "it_science", "name": "IT·과학" }] }
```

### A18. 관심 분야 바꾸기 — `PUT /api/v1/members/me/categories`

로그인이 필요하다. 마이페이지 관심사 설정에서 부른다. 보낸 목록으로 통째로 바꾼다.

| 요청 필드 | 타입 | 용도 · 규칙 |
|---|---|---|
| `categoryCodes` | array(string) | 새 관심 분야 코드. 1개 이상(v17), 5개 중에서. 같은 코드가 두 번 오면 하나로 합친다 |

성공하면 200 과 바뀐 회원 정보(1절). 0개이거나 없는 코드면 400 `VALIDATION_FAILED`.

### A19. 용어사전 — `GET /api/v1/dictionary`

단축키나 *용어사전* 버튼으로 여는 작은 창이 부른다(F13 용어사전, 2026-10-21). 로그인 없이 부른다. 서버가 국립국어원 표준국어대사전 Open API 를 대신 불러 인증 키를 화면에 드러내지 않는다. 검색 기록은 남기지 않는다.

| 인자 | 타입 | 용도 |
|---|---|---|
| `q` | string | 찾을 단어. 앞뒤 공백을 지운 뒤 비어 있으면 400 `VALIDATION_FAILED`. 50자를 넘어도 400(제안 — Open API 의 제한을 보면 다시 맞춘다) |

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `query` | string | 찾은 단어 | 요청의 `q` |
| `items[].word` | string | 표제어 | 표준국어대사전 검색 결과 |
| `items[].pos` | string · null | 품사 | 같음 |
| `items[].definition` | string | 뜻풀이 | 같음 |
| `source` | string | 출처 표시(「표준국어대사전」). 표시 방법은 인증 키를 신청할 때 약관으로 확인한다 | 고정값 |

결과가 없으면 200 과 빈 `items`. 사전 서버가 답하지 않거나 오류 · 하루 한도 초과를 돌려주면 502 `DICTIONARY_UNAVAILABLE`. 같은 검색어(앞뒤 공백을 지우고 유니코드 NFC 로 맞춘 `q`)의 결과는 Redis 에 하루 동안 두고 다시 부르지 않는다(제안). 실패한 결과는 두지 않는다. 이 Redis 는 작업 큐와 같아서 캐시 키에는 꼭 만료를 걸고, 메모리가 찰 때 작업 큐가 밀려나지 않게 하는 설정은 Infra 와 정한다. 원본 응답의 어느 칸을 옮길지는 인증 키를 받아 실제 응답을 본 뒤 정한다.

```json
{ "query": "구원투수", "items": [{ "word": "구원^투수", "pos": "명사", "definition": "…" }], "source": "표준국어대사전" }
```

---

## 3. 마인드맵 `content` (v1)

`article_mindmap.content` 에 저장하는 모양이다. W1 의 `EXTRACT` 결과로 들어온다(`api-internal.md` 5절). 가지 4개는 2026-10-21 회의로 확정했고, JSON 의 세부 모양은 AI · FE 확인 전 제안이다.

| 필드 | 타입 | 용도 |
|---|---|---|
| `title` | string · null | 가운데 글자를 AI 가 따로 지을 때 쓸 자리. 지금은 늘 null 이고 화면은 기사 제목을 쓴다 |
| `branches[]` | array | 가지. 내용이 있는 가지만 넣는다. 하나도 없으면 W1 이 400 `RESULT_SCHEMA_INVALID` |
| `branches[].type` | enum | 가지 종류. 아래 표 4가지 중 하나. 순서는 표 순서대로, 같은 종류는 한 번만 |
| `branches[].items[]` | array | 잎. 한 개 이상. 개수 상한은 두지 않고 실제로 돌려 보고 정한다 |
| `branches[].items[].text` | string | 잎 문장 하나. 잎 사이 선 이름은 없다 |
| `branches[].items[].evidence[]` | array · 없을 수 있음 | 이 잎의 근거 문장(아래 모양). 저장만 하고 A9 로는 내보내지 않는다 |

| `type` | 마인드맵 이름 | 흐름지도 이름 |
|---|---|---|
| `CORE` | 핵심 내용 | 무슨 일이? |
| `CAUSE` | 원인·배경 | 왜 일어났나? |
| `REACTION` | 반응 | 누가 뭐라고 했나? |
| `OUTLOOK` | 전망 | 앞으로는? |

가지 이름 글자는 화면이 정한다. API 는 `type` 만 보낸다(두 보기의 이름이 달라서).

근거 하나의 모양

| 필드 | 타입 | 용도 |
|---|---|---|
| `text` | string | 근거 문장 원문 |
| `paragraphIndex` | number | 몇 번째 문단인가. 본문을 줄바꿈으로 나누고 빈 줄을 뺀 순서, 0부터 |
| `sentenceIndex` | number | 그 문단 안 몇 번째 문장인가, 0부터 |

- 근거는 화면에 보이지 않고 데이터로만 남긴다(2026-10-21). AI 가 기사에 없는 말을 지었는지 평가할 때 쓰고(MVP 개요 7장 「원문 근거 연결 정확도 평가」), 나중에 노드 상세 창을 만들면 그때 쓴다
- `text` 는 그 문단에 글자 그대로 있어야 한다(PRD FR-5). API 가 저장 전에 대조해 맞지 않는 근거만 지운다. 잎은 근거가 없어도 남긴다. 지운 개수는 로그에 남겨 평가에 쓴다. 잎까지 버릴지는 AI 와 정한다(`data-model.md` 5절 4번)
- 근거까지 뽑으면 AI 출력이 길어져 GMS 토큰이 더 든다. 뽑을지는 AI 파트와 정한다(`api.md` 4절)
- 문장을 나누는 규칙은 AI 쪽 코드 하나에만 둔다

```json
{
  "title": null,
  "branches": [
    { "type": "CORE", "items": [{ "text": "한빛반도체가 10월 6일 텍사스 공장 착공식을 열었다",
      "evidence": [{ "text": "한빛반도체는 6일 텍사스 공장 착공식을 열었다.", "paragraphIndex": 0, "sentenceIndex": 0 }] }] },
    { "type": "CAUSE", "items": [{ "text": "미국 보조금 조건을 맞추려고 착공을 앞당겼다" }] },
    { "type": "REACTION", "items": [{ "text": "업계: 인력 수급이 가장 큰 숙제라는 지적" }] },
    { "type": "OUTLOOK", "items": [{ "text": "2028년 양산 목표는 그대로라고 밝혔다" }] }
  ]
}
```
