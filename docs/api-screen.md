# 화면용 API 상세 (v1)

화면이 부르는 A1 ~ A9 · A13 ~ A26 의 인자 · 응답 필드 · 예시다. 공통 규칙 · 오류 코드 · 엔드포인트 목록은 `docs/api.md`, 테이블은 `docs/data-model.md`.
A10 ~ A12 는 사용자 URL 분석이 쓰던 번호다. 2026-10-20 팀 회의로 MVP 에서 빼서 비워 둔다.

표 읽는 법

- **타입**: `number` · `string` · `boolean` · `시각`(ISO 8601 + `+09:00` 문자열) · `enum`(정해진 값 중 하나) · `object` · `array`. 「· null」은 값이 없을 수 있다는 뜻이다
- **용도**: 화면 어디에 쓰나
- **어디서**: `테이블.칸` 은 그 칸을 그대로 준다. 「계산」은 조회할 때 셈한다. 공개 전 기사는 모든 계산에서 뺀다(`api.md` 1절)

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

기사 요약 — A6 · A7 · A22 의 항목, A8 의 바탕

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `id` | number | 기사 마인드맵(A8 · A9)을 열 때. 목록과 상세가 같은 ID (Jira 42) | `article.id` |
| `title` | string | 기사 제목 | `article.title` |
| `publisher` | 언론사 참조 | 언론사. 모든 기사 화면에 보인다(PRD FR-2) | `article.press_code` → `press` |
| `publishedAt` | 시각 | 발행 시각 표시 · 정렬 | `article.published_at` |
| `category` | 카테고리 참조 · null | 기사의 대표 카테고리 표시. 맞추지 못한 기사는 null | `article.category_code` → `category` |
| `summary` | string · null | 목록의 한두 줄 요약. 우리 AI 요약이고 AI 생성 표시를 붙인다. 없으면(분석 전 · 실패 · 우리 요약을 끈 동안) null 이다. 빈 문자열 · 공백뿐인 문자열도 없는 것으로 보고 null(2026-10-23 팀장 확인). NewsData 요약으로 대신하던 길은 없앴다 — 한국어 기사에는 NewsData 가 요약을 만들지 않는다(2026-10-26) | `article_mindmap.summary` |
| `url` | string | *원문 보기* 링크 | `article.url` |
| `mindmapStatus` | enum | *마인드맵 보기* 를 켤지 · 「분석 중」을 보일지 | 계산 (`api-internal.md` 6절) — `NONE` · `QUEUED` · `SUCCEEDED` · `FAILED` · `NOT_ANALYZABLE`(분석할 내용이 없는 기사). 기사는 마인드맵 결과가 생긴 뒤부터 보여서(2026-10-26, Jira 34) 목록 · 상세의 기사는 사실상 늘 `SUCCEEDED` 다. 예외 — 덤프 적재 때까지 임시 공개한 10/21 ~ 11/3 기사는 `NONE`(`SSOT.md` 9절) |
| `bookmarked` | boolean | 북마크 아이콘을 채울지. 로그인한 회원이 이 기사를 담았으면 true, 손님이면 false(2026-10-26 Jira 114) | 계산 — 세션 회원의 `bookmark` |

회원 정보 — A15 · A17 · A18 의 응답. A14 응답도 같은 모양

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `id` | number | 회원 ID | `member.id` |
| `loginId` | string | 로그인 아이디 표시 | `member.login_id` |
| `name` | string | 「OO님」 표시 | `member.name` |
| `categories` | array(카테고리 참조) | 관심 분야. 홈 · 마이페이지 관심사 설정에 쓴다. A1과 같은 `category.sort_order` 순서(2026-10-26 사용자 승인) | `member_category` → `category` |

---

## 2. 엔드포인트

### A1. 카테고리 — `GET /api/v1/categories`

카테고리 선택 화면 · 분야 탭에 쓴다. 5개를 `sort_order` 순서로 준다. 인자는 없다.

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `items[].code` · `items[].name` | 카테고리 참조 | 카테고리 탭 | `category` |
| `items[].issueCount` | number | 「이 분야의 이슈가 아직 없어요」를 보일지(0이면) | 계산 — 이 카테고리에 걸린 이슈 중 공개 기사가 있는 이슈 수 (`issue_category`, `api.md` 1절) |
| `items[].articleCount` | number | 분야별 기사 수 표시 | 계산 — 대표 카테고리가 이것인 공개 기사 수 |

```json
{ "items": [{ "code": "economy", "name": "경제", "issueCount": 3, "articleCount": 1520 }] }
```

### A2. 이슈 목록 — `GET /api/v1/issues`

카테고리별 이슈 목록, 홈 이슈 카드, 검색창 아래 「새로 생성된 이슈」에 쓴다(PRD FR-4, Jira 41).

| 인자 | 타입 | 용도 |
|---|---|---|
| `category` | enum · 선택 | 이 카테고리의 이슈만. 보내지 않으면 전체. 없는 코드와 빈 문자열은 404 `CATEGORY_NOT_FOUND`. U+0000(NUL)이 든 코드도 없는 코드라 404 다(DB 가 이 글자를 받지 못해 500 이었다, 2026-10-30) |
| `sort` | enum · 선택 | `lastEventAt`(기본) — 마지막 사건 발생 시점 최신순(PRD FR-4 가정). `createdAt` — 이슈가 만들어진 최신순, 검색창 아래 「새로 생성된 이슈」(2026-10-20). 같으면 `id` 내림차순. 그 밖의 값이면 400 `VALIDATION_FAILED` |
| `page` · `size` | number · 선택 | 쪽 번호 · 크기 (`api.md` 1절). 검색창 아래는 `size` 로 개수를 정한다(몇 개인지는 미정) |

응답은 목록 모양이고 항목은 아래다. 공개 기사가 있는 이슈만 나오고 `totalElements` 도 그 수다. 사건 수 · 기간 · 최근 사건은 공개 기사가 있는 사건만 본다(`api.md` 1절, 2026-11-09 Jira 179). 정상 생성은 사건 3개가 모였을 때다(2026-10-20).

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `id` · `title` | 이슈 참조 | 카드를 누르면 이슈 화면, 카드 제목 | `issue` |
| `summary` | string · null | 카드의 한두 문장(AI 생성) | `issue.summary` |
| `categories` | array(카테고리 참조) | 카드의 분야 표시. 여러 개일 수 있다 | `issue_category` → `category`, `sort_order` 순서(`data-model.md` 2절) |
| `eventCount` | number | 「사건 8개」 | 계산 — 이 이슈에서 공개 기사가 있는 사건 수 |
| `articleCount` | number | 「기사 23개」 | 계산 — 이 이슈 사건들에 묶인 공개 기사 수 (`article_event`) |
| `publisherCount` | number | 「언론사 5곳」 | 계산 — 그 기사들의 언론사(`press_code`) 수 |
| `firstEventAt` · `lastEventAt` | 시각 · null | 기간 「08.04 ~ 10.09」, 정렬 | 계산 — 공개 기사가 있는 사건 `occurred_at` 의 가장 이른 값 · 늦은 값. 이 목록에 오는 이슈는 늘 값이 있다(타입의 null 허용은 그대로) |
| `createdAt` | 시각 | 「새로 생성된 이슈」 정렬 · 표시 | `issue.created_at` |
| `lastEvent` | 사건 참조 · null | 카드의 「최근 · 인력 수급 우려」(`label`). 조회 사이에 기사가 숨겨지면 null 일 수 있다 | 계산 — 공개 기사가 있는 사건 중 `occurred_at` 내림차순, 같으면 사건 `id` 내림차순으로 하나 선택(2026-10-23 팀장 승인) |
| `interested` | boolean | 별표를 채울지. 로그인한 회원이 이 이슈를 관심 이슈로 저장했으면 true, 손님이면 false(2026-10-26 Jira 114) | 계산 — 세션 회원의 `interest_issue` |

```json
{
  "items": [{
    "id": 12, "title": "한빛반도체 미국 공장 건설", "summary": "한빛반도체가 텍사스 공장 투자를 늘리고 착공했다",
    "categories": [{ "code": "economy", "name": "경제" }],
    "eventCount": 8, "articleCount": 23, "publisherCount": 5,
    "firstEventAt": "2026-08-04T00:00:00+09:00", "lastEventAt": "2026-10-09T08:41:00+09:00",
    "createdAt": "2026-08-21T12:30:00+09:00",
    "lastEvent": { "id": 98, "title": "텍사스 공장 엔지니어 수급 우려 보도", "label": "인력 수급 우려", "occurredAt": "2026-10-09T08:41:00+09:00" },
    "interested": false
  }],
  "page": 0, "size": 20, "totalElements": 1, "totalPages": 1
}
```

### A3. 이슈 헤더 — `GET /api/v1/issues/{issueId}`

이슈 화면 맨 위 헤더(PRD FR-20)에 쓴다. 인자는 주소의 `issueId` 하나. 응답은 A2 항목에서 `lastEvent` 만 뺀 모양이고 필드 뜻도 같다. 기간은 `firstEventAt` ~ `lastEventAt` 이다.

없는 이슈와 공개 기사가 하나도 없는 이슈(`api.md` 1절, 2026-11-09 Jira 179)는 404 `ISSUE_NOT_FOUND`다.
카테고리는 저장된 관계대로 반환하며 `lastEvent` 키는 보내지 않는다(2026-10-23 사용자 승인).

### A4. 타임라인 — `GET /api/v1/issues/{issueId}/timeline`

이슈 에볼루션 맵의 사건 노드를 그린다(F07, Jira 48). 이슈에서 공개 기사가 있는 사건을 페이지 없이 한 번에 준다. 정렬은 `occurredAt` 오름차순, 같으면 `id` 오름차순. 화면은 사건을 **메인 흐름 · 서브 흐름 두 레인**에 놓는다(2026-10-20).

없는 이슈와 공개 기사가 하나도 없는 이슈는 404 `ISSUE_NOT_FOUND`다. 공개 기사가 없는 사건은 타임라인에서 빠진다(`api.md` 1절, 2026-11-09 Jira 179).
사건 발생 시각으로 정렬하며 기사 발행 시각을 대신 쓰지 않는다(2026-10-23 사용자 승인).

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `issueId` | number | 어느 이슈의 타임라인인지 | 주소의 `issueId` |
| `events[].id` · `title` · `label` · `occurredAt` | 사건 참조 | 점 옆 키워드(`label`)와 가로 위치(발생 시점) | `event` |
| `events[].lane` | enum | `MAIN` 메인 흐름 · `SUB` 서브 흐름. 사건의 역할로 나눈다 — 상황을 바꾸는 행위(`event.role` `MAIN`)는 `MAIN`, 다른 사건에 대한 반응 · 평가 · 여론(`REACTION`)은 `SUB`(2026-10-28 AI 제안, Jira 130). 늘 값이 있다 | 계산 — `event.role` |
| `events[].reactsToEventId` | number · null | 반응 사건(`SUB`)이 반응하는 사건 — 화면이 두 사건이 다 보일 때 반응 점선(반응 사건 → 대상 사건)을 그린다. 대상이 **같은 이슈의 사건일 때만** 싣고, 다른 이슈 · 이슈 밖 사건 · 공개 기사가 없는 사건이거나 대상이 없으면(이슈 전반에 대한 반응 · `MAIN`) null 이다. 칸은 늘 있다(2026-10-28 합의, Jira 134) | `event.reacts_to_event_id` — 판정이 보낸 후보 안에서 고른 것만 저장한다(`api-internal.md` 5절) |
| `events[].occurredAtBasis` | enum | 발생 시점을 본문에서 뽑았나(`EXTRACTED`) · 첫 기사 발행 시각으로 채웠나(`FIRST_PUBLISHED`). 뒤의 것이면 「추정」 표시를 붙일 수 있다 | `event.occurred_at_basis` |
| `events[].articleCount` | number | 점에 마우스를 올리면 보이는 기사 수 | 계산 — 이 사건의 공개 기사 수 |
| `events[].publisherCount` | number | 마우스를 올리면 보이는 언론사 수 | 계산 |

선은 둘이다(프로토타입 v21 `LaneTimeline`). ① 메인 레인 사건은 화면이 시간순으로 선(메인 흐름 띠)으로 잇는다 — `lane` 과 정렬만으로 그려 응답 칸이 따로 없다. ② 관계 선은 반응 점선 하나 — 반응 사건과 그 대상 사건(`reactsToEventId`)이 같은 이슈이고 화면에 둘 다 보일 때만 그린다(2026-10-28 합의). 둘 중 하나가 레인에서 숨겨졌으면(「+N」 안) 점선을 그리지 않는다 — 이것은 화면이 고르는 규칙이라 화면이 판단한다. 그리지 않는 것은 관계 종류를 가르는 선(후속 · 원인 · 반박)과 새 정보 같은 사건 태그다(2026-10-20 「선 종류 · 새사실 태그 없음」 — 선 전체를 빼자는 결정이 아니었다, 2026-10-29 바로잡음). 관계 종류 선을 그리기로 하면 그때 `relations[]`(`{ fromEventId, toEventId, type }`, `event_relation` P1)를 더한다(2026-10-21). A4 는 이슈의 사건을 전부 주고 화면이 레인마다 고른다 — 메인 최대 10개 · 서브 최대 5개, 첫 사건 · 마지막 사건 + 나머지는 기사 많은 순(같으면 최근 순), 숨긴 구간은 「+N」으로 펼친다(2026-10-28 FE). 언론사 필터(PRD FR-23)는 P1 이다.

```json
{
  "issueId": 12,
  "events": [
    { "id": 91, "title": "한빛반도체, 텍사스 공장 투자 확대 공식 발표", "label": "공식 발표", "lane": "MAIN", "reactsToEventId": null, "occurredAt": "2026-08-21T00:00:00+09:00", "occurredAtBasis": "EXTRACTED", "articleCount": 5, "publisherCount": 3 },
    { "id": 94, "title": "시민단체, 텍사스 공장 보조금 비판 성명", "label": "비판 성명", "lane": "SUB", "reactsToEventId": 91, "occurredAt": "2026-08-23T00:00:00+09:00", "occurredAtBasis": "EXTRACTED", "articleCount": 2, "publisherCount": 2 }
  ]
}
```

### A5. 사건 패널 — `GET /api/v1/events/{eventId}`

타임라인에서 사건 노드를 누르면 열리는 오른쪽 패널이다(F08, Jira 49). 패널은 사건 요약과 관련 기사(A6)만 보인다(2026-10-20). 아래 필드 중 무엇을 보일지는 FE 가 고른다. 인자는 주소의 `eventId` 하나.

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `id` · `title` · `label` · `occurredAt` | 사건 참조 | 패널 제목 · 날짜 | `event` |
| `summary` | string · null | 저장된 사건 요약(AI 생성). 조회 중 재생성하지 않는다(2026-10-26). 사건 핵심 근거는 보이지 않는다(2026-10-20) | `event.summary` |
| `occurredAtBasis` | enum | A4 와 같다 | `event.occurred_at_basis` |
| `issue` | 이슈 참조 · null | 속한 이슈. null 이면 아직 이슈로 묶이지 않은 사건 | `event.issue_id` → `issue` |
| `articleCount` | number | 「관련 기사 4건」 | 계산 |
| `publishers` | array(언론사 참조) | 이 사건을 보도한 언론사 전부(PRD FR-11). 중복 제거 후 `press.code` 오름차순(2026-10-26 사용자 승인) | 계산 — 공개 기사들의 `press_code` |
| `previousEvent` · `nextEvent` | 사건 참조 · null | *이전 · 다음 사건* 이동. 같은 이슈의 공개 기사가 있는 사건 안에서 A4와 같은 `occurredAt` · `id` 오름차순의 인접 사건. 시각이 같아도 ID로 가른다(2026-10-26 사용자 승인). 없으면 null | 계산 |

없는 사건과 공개 기사가 하나도 없는 사건(`api.md` 1절, 2026-11-09 Jira 179)은 404 `EVENT_NOT_FOUND`다. 이슈 밖 사건은 `issue` · `previousEvent` · `nextEvent`가 모두 null이다.

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
| `page` · `size` | number · 선택 | 화면은 처음 5건을 `size=5` 로 부르고 *더 보기* 에서 다음 쪽을 부른다(2026-10-29 사용자 — PRD FR-11 의 4건에서 화면 구현에 맞춰 바꿈) |

응답은 목록 모양이고 항목은 기사 요약(1절)이다. 정렬은 발행 시각 오름차순, 같으면 `id` 오름차순. 특정 언론사를 앞세우지 않는다(PRD 4.11).

공개 전 기사는 목록과 전체 개수에서 제외한다. 사건이 없거나 공개 기사가 하나도 없으면 404 `EVENT_NOT_FOUND`다. 쪽 번호가 마지막을 넘으면 200과 빈 목록이고 전체 개수는 그대로다.
페이지 인자 기본값·범위는 `api.md` 1절을 따른다. A6는 기존 `ArticleSummaryResponse`와 `ArticleSummaryAssembler`를 재사용한다.

### A7. 최신 기사 — `GET /api/v1/articles`

홈 · 카테고리의 최신 기사 목록이다(F01, Jira 42). 사건이 1~2개뿐이라 이슈가 없는 기사도 여기서 개별 기사로 보인다.

| 인자 | 타입 | 용도 |
|---|---|---|
| `category` | enum · 선택 | 이 대표 카테고리의 기사만. 인자를 보내지 않으면 전체. 없는 코드와 빈 문자열은 404 `CATEGORY_NOT_FOUND`(2026-10-23 팀장 확인). U+0000(NUL)이 든 코드도 404 다(2026-10-30) |
| `page` · `size` | number · 선택 | 쪽 번호 · 크기 |

응답은 목록 모양이고 항목은 기사 요약(1절)이다. 정렬은 발행 시각 최신순(PRD FR-2), 같으면 `id` 내림차순. `summary` 가 null 일 때 무엇을 보일지는 FE 질문(`api.md` 4절)이다.

```json
{
  "items": [{
    "id": 456, "title": "한빛반도체 텍사스 공장 첫 삽… \"2028년 양산 변함없다\"",
    "publisher": { "code": "garam", "name": "가람일보" }, "publishedAt": "2026-10-06T10:12:00+09:00",
    "category": { "code": "economy", "name": "경제" },
    "summary": "한빛반도체가 텍사스 공장을 착공했다", "url": "https://news.example.com/a/456",
    "mindmapStatus": "SUCCEEDED", "bookmarked": false
  }],
  "page": 0, "size": 20, "totalElements": 1, "totalPages": 1
}
```

### A8. 기사 상세 — `GET /api/v1/articles/{articleId}`

기사 마인드맵 화면의 머리와 *이 기사가 속한 이슈 보기*(F11)에 쓴다. 기사 요약(1절)의 필드에 아래를 더한다. 본문(`body`)은 노출 범위(Q3 · Q28)가 정해질 때까지 내보내지 않는다.

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `reporter` | string · null | 기자 이름 | `article.reporter` |
| `eventMatchStatus` | enum | 「사건을 찾는 중」과 「묶이지 않음」을 가른다 — `NONE` · `QUEUED` · `SUCCEEDED` · `FAILED` · `NO_EVENT`(대표 사건이 없어 사건으로 묶지 않는 기사) | 계산 (`api-internal.md` 6절) — 이 기사 `MATCH_EVENT` 작업의 상태, 없으면 `NO_EVENT` 또는 `NONE` |
| `event` | 사건 참조 · null | 속한 사건. 이슈 화면에서 이 사건을 강조한다(PRD FR-15) | `article_event` → `event` |
| `issue` | 이슈 참조 · null | 속한 이슈. *이 기사가 속한 이슈 보기* 로 A3 · A4 를 연다 | `event.issue_id` → `issue` |

판정이 끝났는데(`eventMatchStatus` 가 `SUCCEEDED`) `issue` 가 null 이면 「아직 이슈로 묶이지 않았다」고 안내한다(PRD FR-30). 이슈는 사건 3개가 모여야 생긴다.

```json
{
  "id": 456, "title": "…", "publisher": { "code": "garam", "name": "가람일보" }, "reporter": "김민정 기자",
  "publishedAt": "2026-10-06T10:12:00+09:00", "url": "https://news.example.com/a/456",
  "category": { "code": "economy", "name": "경제" },
  "summary": "…", "mindmapStatus": "SUCCEEDED", "bookmarked": true, "eventMatchStatus": "SUCCEEDED",
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

### A13. 통합 검색 — `GET /api/v1/search` (MVP)

Ctrl+K(맥 ⌘K) 빠른 이동(PRD FR-3, Jira 43)이 부른다. MVP 에 넣는다 — PRD FR-3 「카테고리 선택(F02) · P0」 에 빠른 이동이 들어 있다(2026-10-29 사용자). 검색창을 열었을 때 아래에 보이는 「새로 생성된 이슈」는 A2(`sort=createdAt`)로 받는다. 로그인 없이 부른다.

찾는 규칙(2026-10-30 사용자, 성공 기준은 `docs/specs/F02-search-api.md`):

- **제목만** 찾는다 — 이슈 · 사건 · 기사 제목에 검색어가 그대로 들어 있으면 맞다. 영문은 대소문자를 가리지 않는다. 요약 · 본문 · 사건 키워드는 찾지 않는다
- `%` · `_` · `\` 도 그냥 글자다(패턴 검색이 아니라 위치 찾기)
- 검색어는 앞뒤 공백을 지우고 NFC 로 맞춘 뒤 1 ~ 50자. 비었거나 넘으면 400 `VALIDATION_FAILED` 와 `errors[q]`(「검색어를 입력해 주세요」 · 「검색어는 50자까지예요」). U+0000(NUL)이 들어 있어도 400 「검색어에 쓸 수 없는 글자가 들어 있어요」 — DB 가 이 글자를 받지 못한다(2026-10-30). 규칙은 A19 와 같다
- 이슈 · 사건은 공개 기사가 있는 것만, 사건은 **이슈에 묶인 것만**(누르면 그 이슈로 간다), 기사는 공개된 것만(`docs/api.md` 1절)
- 유형마다 최신순 **20개까지** — 이슈는 만든 때, 사건은 발생 시점, 기사는 발행 시각. 같으면 id 가 큰 것 먼저. 전체 개수는 주지 않는다
- 결과가 없으면 200 과 빈 배열 셋

| 인자 · 필드 | 타입 | 용도 |
|---|---|---|
| `q` (인자) | string | 검색어(위 규칙) |
| `issues[]` | 이슈 참조 | 이슈 결과. 누르면 이슈 화면 |
| `events[]` | `{ id, title, issueId }` | 사건 결과. 누르면 그 이슈의 타임라인에서 그 사건 |
| `articles[]` | `{ id, title }` | 기사 결과. 누르면 기사 마인드맵 |

```json
{ "issues": [{ "id": 12, "title": "…" }], "events": [{ "id": 98, "title": "…", "issueId": 12 }], "articles": [{ "id": 456, "title": "…" }] }
```

### A14. 가입 — `POST /api/v1/members`

가입 화면(F12 회원 · 관심 분야, Jira 62)이 부른다. 로그인 없이 부른다. 입력 규칙은 프로토타입 v17 가입 화면을 따랐다(2026-10-21. v17 은 팀 공유 파일이라 저장소 `docs/prototype/` 에는 없다 — 저장소에는 v12 ~ v15 · v19 ~ v21).

| 요청 필드 | 타입 | 용도 · 규칙 |
|---|---|---|
| `loginId` | string | 로그인 아이디. 영문 소문자 · 숫자 · `_` 로 4 ~ 20자(`^[a-z0-9_]{4,20}$`, 2026-10-26 Jira 62) |
| `password` | string | 비밀번호. 8 ~ 64자, 공백만으로는 안 된다. 서버는 해시(bcrypt)만 저장한다(`member.password_hash`). bcrypt 는 72바이트까지만 읽어서, 64자 안이어도 UTF-8 로 72바이트를 넘으면(한글이 많으면) 400 이다 |
| `name` | string | 이름. 비어 있으면 안 되고 20자까지. 세션에도 실려 하루 동안 Redis 에 남아서 상한을 둔다(2026-10-26 Jira 62). U+0000(NUL)이 들어 있으면 400 「이름에 쓸 수 없는 글자가 들어 있어요」 — DB 가 이 글자를 받지 못한다(2026-10-30) |
| `categoryCodes` | array(string) | 관심 분야 코드. 1개 이상, 5개 중에서. 같은 코드가 두 번 오면 하나로 합친다. 없는 코드는 요청 본문 값이라 400 이다(주소 · 인자의 코드가 없을 때만 404). U+0000(NUL)이 든 코드도 없는 코드다(2026-10-30) |

| 결과 | 상태 |
|---|---|
| 가입했다 — 회원 정보(1절)를 주고 로그인된 세션을 연다(v17 가입 화면이 가입 뒤 바로 들어간다) | 201, 응답 머리 `Location: /api/v1/members/me` |
| 규칙에 안 맞는다(아이디 규칙, 짧거나 긴 비밀번호, 빈 이름 · 21자 이상 이름, 관심 분야 0개, 없는 코드) | 400 `VALIDATION_FAILED` — `errors` 에 칸과 화면에 보일 문장 |
| 아이디를 이미 누가 쓴다 | 409 `LOGIN_ID_TAKEN` |
| 같은 IP 에서 1분에 100번을 넘게 불렀다 — 입구(Envoy)가 막아 서버까지 오지 않는다(2026-10-29 Jira 135. 2026-10-30 Jira 137 에서 10 → 100 — QA · 발표 때 같은 와이파이) | 429 `RATE_LIMITED`, 응답 머리 `Retry-After: 60` (`docs/api.md` 2절) |

### A15. 로그인 — `POST /api/v1/auth/login`

| 요청 필드 | 타입 | 용도 |
|---|---|---|
| `loginId` · `password` | string | 아이디와 비밀번호 |

성공하면 200 과 회원 정보(1절)를 주고 세션 쿠키를 붙인다. 아이디가 없거나 비밀번호가 틀리면 401 `LOGIN_FAILED` 이다 — 둘 중 무엇인지는 알려 주지 않는다. 아이디 · 비밀번호가 비었거나 너무 길면(아이디 64자 · 비밀번호 128자 넘음) 400 `VALIDATION_FAILED`. U+0000(NUL)이 든 아이디는 가입 규칙상 있을 수 없어 없는 아이디와 같은 401 이고 똑같이 센다(2026-10-30).

같은 아이디로 5번 연속 틀리면 1분 동안 잠겨 429 `TOO_MANY_REQUESTS` 다. 잠긴 동안은 비밀번호가 맞아도 429 다. 없는 아이디도 똑같이 세어 그 아이디가 있는지 드러내지 않는다. 한꺼번에 여러 요청을 보내도 비밀번호를 맞춰 보는 것은 5번까지이고 나머지는 429 다. 센 횟수는 로그인에 성공하거나 마지막으로 틀린 뒤 10분이 지나면 지운다(2026-10-26 Jira 62).

이와 따로 입구(Envoy)가 같은 IP 에서 1분에 300번을 넘는 로그인을 429 `RATE_LIMITED`(응답 머리 `Retry-After: 60`)로 막는다 — 아이디를 바꿔 가며 찍어 보는 것은 아이디마다 세는 위 잠금으로 막지 못해서다(2026-10-29 Jira 135. 2026-10-30 Jira 137 에서 20 → 300 — QA · 발표 때 같은 와이파이). 두 429 는 코드가 달라 화면 안내도 다르다(`docs/api.md` 2절).

가입 · 로그인으로 세션을 열 때는 세션 ID 를 새로 발급하고(세션 고정 공격 막기) CSRF 번호표도 새로 준다. 이미 로그인한 채 A14 · A15 를 불러도 막지 않는다 — 세션 ID 를 새로 내고 그 세션의 회원을 방금 들어온 회원으로 바꾼다. 세션 · 쿠키 · 번호표 규칙은 `api.md` 1절 「인증」.

### A16. 로그아웃 — `POST /api/v1/auth/logout`

로그인이 필요하다. 세션을 끝내고 204 를 주며 CSRF 번호표를 새로 준다. 세션이 없으면 401 `UNAUTHORIZED`.

### A17. 내 정보 — `GET /api/v1/members/me`

로그인이 필요하다. 회원 정보(1절)를 준다. 홈에서 관심 분야를 먼저 보여 줄 때와 마이페이지 관심사 설정에 쓴다.

로그인하지 않았으면 401 `UNAUTHORIZED` 다. 세션 쿠키는 화면이 읽지 못해서(HttpOnly) 화면은 앱이 뜰 때 A17 을 불러 200 이면 회원, 401 이면 손님으로 본다(2026-10-21). 이 401 은 로그인 화면으로 보내지 않는다.

```json
{ "id": 7, "loginId": "newlearn01", "name": "김뉴런", "categories": [{ "code": "economy", "name": "경제" }, { "code": "it_science", "name": "IT·과학" }] }
```

### A18. 관심 분야 바꾸기 — `PUT /api/v1/members/me/categories`

로그인이 필요하다. 마이페이지 관심사 설정에서 부른다. 보낸 목록으로 통째로 바꾼다.

| 요청 필드 | 타입 | 용도 · 규칙 |
|---|---|---|
| `categoryCodes` | array(string) | 새 관심 분야 코드. 1개 이상(v17), 5개 중에서. 같은 코드가 두 번 오면 하나로 합친다 |

성공하면 200 과 바뀐 회원 정보(1절). 0개이거나 없는 코드면 400 `VALIDATION_FAILED`. U+0000(NUL)이 든 코드도 없는 코드다(2026-10-30).

누락·null 목록과 비어 있는 코드도 400이며 `errors[]`에 칸과 한국어 이유를 준다.
중복을 합친 고유 코드가 5개 중 하나인지 검사하므로 같은 코드를 여러 번 보내도 하나로 저장한다.
현재 로그인한 본인의 관심 분야만 바꾸며 모든 값이 맞을 때 한 트랜잭션으로 교체한다. 교체 중 실패하면 이전 목록을 유지한다.
A17은 DB의 현재 목록을 읽으므로 이미 로그인한 다른 세션에서도 변경 결과를 확인할 수 있다.

인증 · CSRF 오류의 순서는 `docs/api.md` 2절 「어느 검사에서 어느 코드가 나가나」를 따른다.

### A19. 용어사전 — `GET /api/v1/dictionary`

**화면은 2026-11-10 부터 이 API 를 부르지 않는다** — 용어사전은 드래그한 말의 문맥 뜻(A26)으로 바뀌었다(Jira 187). 서버 코드 · 키는 되돌릴 때를 위해 그대로 둔다. 아래는 그 전까지의 계약이다.

*용어사전* 버튼으로 여는 작은 창이 부른다(F13 용어사전, 2026-10-21. 단축키는 없다 — UX 문서). 로그인 없이 부른다. 서버가 국립국어원 표준국어대사전 Open API 를 대신 불러 인증 키를 화면에 드러내지 않는다. 검색 기록은 남기지 않는다. 구현과 성공 기준은 `docs/specs/F13-dictionary-api.md`(Jira 102).

| 인자 | 타입 | 용도 |
|---|---|---|
| `q` | string | 찾을 단어. 앞뒤 공백을 지우고 유니코드 NFC 로 맞춘다. 없거나 비면 400 `VALIDATION_FAILED` 와 `errors[]` 의 `q` 「찾을 단어를 입력해 주세요」. 50자(글자 수)를 넘어도 400 「찾을 단어는 50자까지예요」. 50자는 우리 제안이다 — Open API 안내에 길이 제한이 없다(2026-10-29 확인). U+0000(NUL)이 들어 있으면 400 「찾을 단어에 쓸 수 없는 글자가 들어 있어요」(A13 과 같은 규칙, 2026-10-30) |

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `query` | string | 찾은 단어 | 다듬은 `q`(앞뒤 공백을 지우고 NFC) |
| `items[].word` | string | 표제어. 사전 표기 그대로라 띄어 써도 되는 자리의 `^` 가 남는다(「구원^투수」) | 표준국어대사전 검색 결과 `item.word` |
| `items[].pos` | string · null | 품사(「명사」). 사전이 「품사 없음」으로 주는 구 표제어(「구원^투수」)는 null | 같음 `item.pos` |
| `items[].definition` | string | 뜻풀이 | 같음 `item.sense.definition` |
| `source` | string | 출처 표시 「국립국어원 표준국어대사전」. 사전 텍스트는 CC BY-SA 2.0 KR 이라 저작자 표시가 필수다(사전 누리집 저작권 정책, 2026-10-29 사용자). 화면은 결과와 함께 보인다 | 고정값 |

`items` 는 사전 검색 결과의 첫 쪽(표제어 10개까지)이다. 검색 결과는 표제어마다 첫 뜻풀이 하나만 주어, 동음이의어(「사과」 8개)는 표제어마다 항목이 하나씩이다(2026-10-29 실제 키로 확인). 결과가 없으면 200 과 빈 `items`.

사전 서버가 답하지 않거나(연결 2초 · 읽기 3초) 오류 · 읽을 수 없는 응답(JSON 이 아님 · 항목이 왔는데 하나도 못 읽음)을 돌려주면 502 `DICTIONARY_UNAVAILABLE`. 키를 넣기 전에는 사전을 부르지 않고 502 다. 결과가 없으면 사전이 200 과 빈 본문을 준다 — 200 빈 `items` 로 옮긴다. 틀린 키도 같은 빈 본문이라 응답만으로는 둘을 가를 수 없다(2026-10-29 실제 키로 확인). 그래서 키는 사이트에 봉인할 때 그 키로 한 번 불러 확인한다.

같은 IP 에서 1분에 100번을 넘게 부르면 입구(Envoy)가 429 `RATE_LIMITED`(응답 머리 `Retry-After: 60`)로 막는다 — 서버까지 오지 않아 사전도 부르지 않는다. 메서드를 가리지 않고 한 바구니로 센다 — GET 말고는 서버가 401 로 돌려보낸다(2026-10-29 Jira 135, `docs/api.md` 2절). IP 를 바꿔 가며 부르는 것은 이 상한으로 못 막아, 하루 한도는 아래 앱의 셈이 지킨다.

같은 검색어(다듬은 `q`)의 결과는 Redis 에 하루(키 `dict:<검색어>`, 만료 1일) 두고 다시 부르지 않는다(2026-10-29 사용자). 결과가 있을 때만 둔다 — 결과 없음 · 실패는 두지 않는다. 틀린 키의 빈 본문을 하루 동안 「결과 없음」으로 굳히지 않으려는 것이다. 이 Redis 는 세션 · 작업 큐와 같아서 키에 꼭 만료를 걸고, 가득 차도 지우지 않는다(noeviction, `infra/k8s/services/data/redis.yaml`) — 저장 · 읽기가 실패하면 건너뛰고 사전 결과를 그대로 준다.

사전을 부르려 한 수를 한국 날짜 단위로 세어, 그날 45,000건(Open API 하루 한도 50,000건의 90%)을 넘으면 사전을 부르지 않고 502 `DICTIONARY_UNAVAILABLE` 이다(2026-10-29 사용자, Jira 135). 저장해 둔 결과를 돌려줄 때는 세지 않는다. 세는 것은 부르기 직전이라 사전이 오류를 준 부름도 한 번이다 — 실제 성공 호출 수보다 조금 크다. 횟수는 Redis 키 `dictquota:<날짜>`(만료 2일)에 두어 API Pod 가 여럿이어도 같고, 세지 못하면(Redis 실패) 막지 않고 부른다. 사전 쪽 「하루」가 몇 시에 바뀌는지는 미확인이라 한국 자정으로 둔다 — 두 하루의 경계가 다르면 사전 쪽 하루 하나에 우리 이틀 몫이 걸쳐 한도를 넘을 수 있다(그때는 사전이 오류를 줘 결국 같은 502). 10% 여유는 이 경계를 다 막지 못한다. 한도는 설정값 `newlearn.dictionary.daily-limit` 이다.

원본 응답의 칸은 Open API 공식 안내의 예시와 같다(2026-10-29 실제 키로 다섯 낱말을 불러 확인). `item` · `sense` 가 객체 하나로 오거나 배열로 와도 받는다. 키 이름은 env `STDICT_API_KEY`, 하루 요청 한도는 50,000건(`SSOT.md` 5절).

```json
{ "query": "구원투수", "items": [{ "word": "구원^투수", "pos": "명사", "definition": "…" }], "source": "국립국어원 표준국어대사전" }
```

### A20 · A21. 북마크 담기 · 빼기 — `PUT` · `DELETE /api/v1/members/me/bookmarks/{articleId}`

기사 옆 북마크 아이콘(홈 최신 기사 · 기사 미리보기 · 마인드맵 머리 · 사건 패널 · 나의 뉴스함)이 부른다(PRD FR-18, Jira 63). 로그인이 필요하고 CSRF 번호표를 붙인다. 요청 본문은 없다. 화면 이름은 「북마크」다 — 「스크랩」은 쓰지 않는다(UX 문서 규칙, 2026-10-26).

| 결과 | 상태 |
|---|---|
| 담았다(A20) · 뺐다(A21). 응답은 바뀐 뒤의 상태다(아래 표). 이미 담긴 기사를 또 담거나 안 담긴 기사를 빼도 같은 응답이다 — 버튼을 빠르게 두 번 눌러 요청이 동시에 와도 오류가 없다. 이미 담긴 기사를 또 담으면 담은 시각은 그대로다(뺐다가 다시 담으면 새 시각) | 200 |
| 없는 기사 · 공개 전 기사를 담으려 했다(A20 만. A21 은 기사를 확인하지 않고 없는 기사여도 200) | 404 `ARTICLE_NOT_FOUND` |
| `articleId` 가 숫자가 아니다 | 400 `VALIDATION_FAILED` |
| 번호표가 없다(세션과 관계없이) · 번호표는 있는데 로그인하지 않았다 | 403 `FORBIDDEN` · 401 `UNAUTHORIZED` |

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `articleId` | number | 어느 기사인지 | 주소의 `articleId` |
| `bookmarked` | boolean | 바뀐 뒤 담겨 있나. A20 은 늘 true, A21 은 늘 false | 계산 |
| `bookmarkedAt` | 시각 · null | 담은 시각. 뺐으면 null | `bookmark.created_at` |

```json
{ "articleId": 456, "bookmarked": true, "bookmarkedAt": "2026-10-26T14:03:00+09:00" }
```

저장은 `insert … on conflict (member_id, article_id) do update set created_at = bookmark.created_at returning …` 처럼 넣기와 담은 시각 읽기를 한 문장으로 한다 — 「먼저 읽고 없으면 넣기」나 JPA `save()`(합치기)로 하면 동시에 온 두 요청이 기본 키에 부딪쳐 500 이 나거나 담은 시각을 덮고, 넣기와 읽기를 두 문장으로 나누면 그 사이에 빼기가 끼어들어 404 가 난다. A23 도 같다

화면이 할 일 — 판단하지 않고 응답을 따른다(2026-10-26 정한 약속, 문구는 프로토타입 v21 그대로)

- 아이콘은 응답의 `bookmarked` 로 맞춘다. 요청이 엇갈리면 마지막에 받은 응답을 따른다
- 스낵바 문구는 고정이다 — `bookmarked` 가 true 면 「나의 뉴스함에 담았어요」, false 면 「나의 뉴스함에서 뺐어요」. 마인드맵 머리의 글자형 버튼은 「북마크」 · 「북마크됨」
- 손님이면 401 이 온다 — 로그인 창을 열고, 로그인하면 같은 요청을 한 번 더 보낸다

### A22. 나의 뉴스함 — `GET /api/v1/members/me/bookmarks`

헤더의 *나의 뉴스함* 이 부른다(PRD FR-18, Jira 63). 로그인이 필요하다. 인자는 없다. 쪽을 나누지 않고 담은 기사를 전부 `items` 로 준다 — 분야 탭 「전체 N · 경제 N」은 화면이 이 목록으로 센다(2026-10-26). 탭은 기사 자신의 `category` 로 나누고, 분야가 없는(null) 기사는 「전체」에만 든다(프로토타입은 기사가 속한 이슈의 분야로 셌다). 한 사람이 수백 개를 넘게 담아 느려지면 `page` 인자를 더한다. 인자 없는 호출은 그때도 전부다. 정렬은 담은 시각 최신순, 같으면 기사 `id` 내림차순.

항목은 기사 요약(1절, `bookmarked` 는 늘 true)에 `bookmarkedAt`(담은 시각, `bookmark.created_at`)을 더한다. 담은 기사가 없으면 200 과 빈 `items`(화면: 「아직 담은 기사가 없어요」).

```json
{ "items": [{ "id": 456, "title": "…", "publisher": { "code": "garam", "name": "가람일보" }, "publishedAt": "2026-10-06T10:12:00+09:00", "category": { "code": "economy", "name": "경제" }, "summary": "…", "url": "https://news.example.com/a/456", "mindmapStatus": "SUCCEEDED", "bookmarked": true, "bookmarkedAt": "2026-10-26T14:03:00+09:00" }] }
```

### A23 · A24. 관심 이슈 저장 · 해제 — `PUT` · `DELETE /api/v1/members/me/interest-issues/{issueId}`

이슈 머리의 별표가 부른다(PRD FR-19, Jira 64). 규칙은 A20 · A21 과 같다 — 200 과 바뀐 상태 `{ "issueId": 12, "interested": true, "interestedAt": "…" }`(해제는 false · null), 겹쳐도 같은 응답, 없는 이슈 · 공개 기사가 하나도 없는 이슈를 저장하려 하면(A23 만) 404 `ISSUE_NOT_FOUND`, 로그인 · 번호표가 필요하다. 숫자가 아닌 `issueId` 는 400 `VALIDATION_FAILED`. 화면은 별표를 응답의 `interested` 로 맞추고, 스낵바 문구는 고정이다 — true 면 「관심 이슈로 저장했어요」, false 면 「관심 이슈에서 뺐어요」. 손님 처리는 A20 · A21 과 같다.

### A25. 관심 이슈 목록 — `GET /api/v1/members/me/interest-issues`

마이페이지의 *관심 이슈* 가 부른다(PRD FR-19, Jira 64). 로그인이 필요하다. A22 처럼 쪽 없이 전부 `items` 로 주고, 정렬은 저장한 시각 최신순, 같으면 이슈 `id` 내림차순. 항목은 A2 이슈 카드(`interested` 는 늘 true)에 `interestedAt`(저장한 시각, `interest_issue.created_at`)을 더한다. 공개 기사가 하나도 없는 이슈는 빠진다 — 저장 행은 남아 기사가 다시 공개되면 돌아온다(`api.md` 1절, 2026-11-09 Jira 179). 「지난 방문 이후 새 사건 N」은 보류라 데이터가 없다 — 마이페이지의 「새 사건 N」 배지는 그리지 않는다(2026-10-26). 홈 추천에서 별표한 이슈를 먼저 보이는 것은 화면이 A25 와 A2 를 합친다 — A2 에 정렬 인자를 더하지 않는다. 없으면 200 과 빈 `items`(화면: 「아직 저장한 이슈가 없어요」).

### A26. 드래그한 말의 문맥 뜻 — `POST /api/v1/dictionary/meaning`

기사 · 이슈 · 사건 화면에서 글자를 드래그하면 뜨는 「의미」 말풍선이 부른다(F13 용어사전, 2026-11-09 사용자, Jira 187). 사전처럼 뜻을 여러 개 늘어놓지 않고, 서버가 SSAFY GMS(gpt-6-luna)로 **그 글의 문맥에 맞는 뜻 하나**를 받아 표제어 · 품사 · 뜻풀이로 준다. 로그인과 CSRF 번호표가 필요하다 — GMS 는 팀 공용 예산이고 화면도 회원 전용이다. 단어와 기사 글이 주소에 실려 접근 로그에 남지 않게 POST 본문으로 받는다. 검색 기록은 남기지 않는다. 구현과 성공 기준은 `docs/specs/F13-dictionary-api.md`.

| 본문 칸 | 타입 | 용도 |
|---|---|---|
| `term` | string | 드래그한 말. 앞뒤 공백을 지우고 NFC, 1 ~ 50자, 글자(`\p{L}`)가 하나는 있어야 한다. 비었으면 400 「뜻을 찾을 말을 골라 주세요」, 글자가 없으면(「.」 · 「2026」) 「뜻을 찾을 글자가 없어요」, 50자를 넘으면 「고른 말은 50자까지예요」, U+0000 이면 「고른 말에 쓸 수 없는 글자가 들어 있어요」 |
| `around` | string | 고른 말의 앞뒤 30자씩을 붙인 화면 글 조각, 120자까지. 고른 말이 글의 어느 자리인지 모델이 알게 한다. 비었으면 400 「고른 말 주변 글이 필요해요」, 120자를 넘으면 「고른 말 주변 글은 120자까지예요」 |
| `contextType` | enum | `ARTICLE` · `ISSUE` · `EVENT`. 다르면 400 |
| `contextId` | number | 그 기사 · 이슈 · 사건의 ID. 없으면 400 |

| 응답 필드 | 타입 | 용도 |
|---|---|---|
| `query` | string | 다듬은 `term` |
| `word` | string · null | 표제어 — 조사 · 어미를 뗀 기본형(「이자를」 → 「이자」) |
| `pos` | string · null | 품사(「명사」). 구 · 고유 명사처럼 맞는 품사가 없으면 null |
| `definition` | string · null | 그 글의 문맥에 맞는 뜻풀이 한 문장(AI 생성. 화면은 「AI 생성」 표시를 붙이지 않는다 — 2026-11-10 사용자, Jira 188) |

```json
{ "query": "이자를", "word": "이자", "pos": "명사", "definition": "남에게 돈을 빌려 쓴 대가로 치르는 일정 비율의 돈." }
```

뜻 단위가 아니거나(말 조각 · 조사만) 문맥으로도 뜻을 확신할 수 없으면 200 에 `word` · `pos` · `definition` 이 null 이다(화면: 「뜻을 풀이하기 어려워요. 낱말 전체를 골라 보세요.」).

**아무 글이나 넣어 GMS 를 쓰지 못하게** — `term` 은 `around` 안에, `around` 는 그 대상의 화면 글 안에 있어야 한다. 비교는 공백을 모두 뺀 NFC 로 한다(마인드맵 보기가 잎을 줄로 나누며 줄 사이 공백을 버려서다). 화면 글은 ARTICLE 이 기사 제목 · 마인드맵 가운데 제목(`content.title`) · 잎 글, ISSUE 가 제목 · 요약, EVENT 가 제목 · 이름(`label`) · 요약이다. 기사 본문은 화면에 없어 비교하지 않고 모델에 주는 문맥으로만 쓴다(고른 말 앞뒤 500자, 본문에 그 말이 없으면 앞 1,000자). 맞지 않으면 400 이고 GMS 를 부르지 않는다. 대상의 공개 규칙은 각 화면과 같다 — 없거나 숨긴 기사는 404 `ARTICLE_NOT_FOUND`(마인드맵이 없어도 제목은 고를 수 있다), 이슈는 A3 처럼 `ISSUE_NOT_FOUND`, 사건은 A5 처럼 `EVENT_NOT_FOUND`.

같은 대상의 같은 말(공백만 다른 것 포함)은 Redis 에 하루(키 `meaning:<종류>:<id>:<공백 뺀 말>`, 만료 1일) 두고 GMS 를 다시 부르지 않는다 — 처음 받은 답으로 하루 고정한다. 풀이 불가도 둔다. GMS 실패는 두지 않는다. GMS 를 부르려 한 수는 한국 날짜 단위로 세어(키 `meaningquota:<날짜>`, 만료 2일) 하루 한도(설정 `newlearn.dictionary.meaning.daily-limit`, env `MEANING_DAILY_LIMIT`, 기본 3,000 — 첫 실측 전 제안값)를 넘으면 502 다. 저장해 둔 답은 세지 않는다. 아래 다시 부르기 때문에 한도 1번에 GMS 호출은 최대 2번이다(하루 최대 6,000번). A19 와 달리 **세지 못하면(Redis 실패) 막는다** — 이 한도가 GMS 비용의 상한이라서다. 한도 0 은 GMS 호출을 끄는 스위치다.

GMS 를 기다리는 시간은 연결 2초 · 읽기 12초다. 2초 안에 실패한 연결 오류 · 5xx 만 한 번 더 부른다(GMS 는 502 · 연결 끊김이 가끔 있고 다시 부르면 이어졌다, `SSOT.md` 10절). 늦게 실패한 것은 다시 부르지 않는다 — 입구 시간 제한(20초) 안에 끝내려는 것이다. 키가 없거나 · GMS 가 답하지 않거나 · 오류(401 · 429 · 400 포함) · 읽을 수 없는 답(JSON 이 아님 · `found` 가 없음 · 표제어나 뜻풀이가 비었거나 길다)이면 502 `DICTIONARY_UNAVAILABLE`(화면: 「지금은 찾을 수 없어요」). 모델이 거절했거나 내용 필터에 걸리면 풀이 불가로 본다. 키 · 고른 말 · 문맥 · GMS 답은 로그에 남기지 않는다.

같은 IP 에서 1분에 100번을 넘게 부르면 입구(Envoy)가 429 `RATE_LIMITED` 로 막는다 — A19 와 다른 바구니다(`infra/k8s/services/app/ratelimit.yaml`). 키 이름은 env `GMS_API_KEY`(사이트는 봉인 Secret `gms-api`, `SSOT.md` 5절).

---

## 3. 마인드맵 `content` (v1)

`article_mindmap.content` 에 저장하는 모양이다. W1 의 `EXTRACT` 결과로 들어온다(`api-internal.md` 5절). 가지 4개는 2026-10-21 회의로 확정했고, JSON 의 세부 모양은 AI · FE 확인 전 제안이다.

| 필드 | 타입 | 용도 |
|---|---|---|
| `title` | string · null | 가운데 글자를 AI 가 따로 지을 때 쓸 자리. 지금은 늘 null 이고 화면은 기사 제목을 쓴다 |
| `branches[]` | array | 가지. 내용이 있는 가지만 넣는다. 하나도 없으면 W1 이 400 `RESULT_SCHEMA_INVALID` |
| `branches[].type` | enum | 가지 종류. 아래 표 4가지 중 하나. 순서는 표 순서대로, 같은 종류는 한 번만 |
| `branches[].items[]` | array | 잎. 한 개 이상. 개수 상한은 두지 않고 실제로 돌려 보고 정한다. 순서는 아래 「잎 순서」 |
| `branches[].items[].text` | string | 잎 문장 하나. 잎 사이 선 이름은 없다 |
| `branches[].items[].evidence[]` | array · 없을 수 있음 | 이 잎의 근거 문장(아래 모양). 저장만 하고 A9 로는 내보내지 않는다 |

| `type` | 마인드맵 이름 | 흐름지도 이름 |
|---|---|---|
| `CORE` | 핵심 내용 | 무슨 일이? |
| `CAUSE` | 원인·배경 | 왜 일어났나? |
| `REACTION` | 반응 | 누가 뭐라고 했나? |
| `OUTLOOK` | 전망 | 앞으로는? |

가지 이름 글자는 화면이 정한다. API 는 `type` 만 보낸다(두 보기의 이름이 달라서).

잎 순서 (2026-10-27, AI 안 B · BE 동의)

- 가지 안의 잎은 워커가 보낸 순서 그대로다. API 는 저장할 때도 A9 로 내보낼 때도 잎 순서를 바꾸지 않는다(가지만 위 표 순서로 줄 세운다)
- `CORE` 는 대표 사건 잎(`primaryCoreIndex`, `api-internal.md` 5절)을 맨 앞에 둔다. 흐름지도 「무슨 일이?」 첫 줄이 이 기사의 대표 사건이 되게 하려는 것이다. 그래서 대표 사건이 있으면 `primaryCoreIndex` 는 0 이다. 워커 코드로 맞춰서 GMS 비용은 들지 않는다
- 다른 가지(`CAUSE` · `REACTION` · `OUTLOOK`)의 잎은 AI 가 정한 순서다
- API 는 `primaryCoreIndex` 가 0 인지 검사하지 않는다 — 대표 사건이 없는 기사는 null 이고, 검사를 더하면 실패와 다시 부르기만 는다

근거 하나의 모양

| 필드 | 타입 | 용도 |
|---|---|---|
| `text` | string | 근거 문장 원문 |
| `paragraphIndex` | number | 몇 번째 문단인가. 본문을 줄바꿈(`\n`)으로 나누고, 줄마다 앞뒤 공백을 지운 뒤, 빈 줄을 뺀 순서, 0부터. 공백은 Python `str.isspace()` 가 공백으로 보는 글자다 — 줄바꿈 없는 공백(U+00A0) · U+3000 · U+0085 도 지운다. 워커는 `line.strip()` 그대로, API 는 같은 판정을 따로 둔다(Java `String.strip()` 은 U+00A0 을 남겨 그 글자만 있는 줄이 문단으로 세어진다 — 2026-10-27 Jira 56 리뷰). API(Java)와 워커(Python)가 이 규칙으로 똑같이 나눈다 |
| `sentenceIndex` | number | 그 문단 안 몇 번째 문장인가, 0부터 |

- 근거는 화면에 보이지 않고 데이터로만 남긴다(2026-10-21). AI 가 기사에 없는 말을 지었는지 평가할 때 쓰고(MVP 개요 7장 「원문 근거 연결 정확도 평가」), 나중에 노드 상세 창을 만들면 그때 쓴다
- `text` 는 그 문단에 글자 그대로 있어야 한다(PRD FR-5). API 가 저장 전에 대조해 맞지 않는 근거만 지운다. 대조는 `paragraphIndex` 가 범위 안이고 그 문단에 `text` 가 한 글자도 다르지 않게 들어 있는지만 본다. 공백 · 따옴표를 맞추지 않고, `sentenceIndex` 는 대조하지 않는다(2026-10-21 BE 안). 잎은 근거가 없어도 남긴다(2026-10-23 AI 동의). 지운 개수는 로그에 남겨 평가에 쓴다
- 근거는 뽑는다 — PRD SM-2 근거 연결 평가와 나중의 노드 상세 창(F05)에 쓴다. 근거 문장을 모델이 그대로 쓰게 하면 출력이 길어져 GMS 토큰이 더 들어서 **문장 번호 방식**을 권한다: 워커가 본문 문장마다 번호(`[P0-S1]` — 0번 문단 1번 문장)를 붙여 넣고, 모델은 번호만 답하고, 워커가 그 번호로 원문 문장을 꺼내 `text` 를 채운다. 그러면 `text` 가 늘 원문 그대로라 대조에서 버려지지 않는다. W1 모양은 같고, 최종 방법은 AI 가 정한다(2026-10-21 BE 안. 이 질문은 2026-10-23 AI 답으로 닫혔다 — `api.md` 4절 끝 문단)
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
