# 화면용 API 상세 (v0)

화면이 부르는 A1~A13 의 인자 · 응답 필드 · 예시다. 공통 규칙 · 오류 코드 · 엔드포인트 목록은 `docs/api.md`, 테이블은 `docs/data-model.md`.

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
| `code` | enum | 링크 · 필터에 쓰는 코드(`economy` 등 7개) | `category.code` |
| `name` | string | 화면에 보이는 이름(경제) | `category.name` |

이슈 참조 — `{ id, title }`

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `id` | number | 이슈 화면(A3 · A4)을 열 때 쓴다 | `issue.id` |
| `title` | string | 링크 글자 | `issue.title` |

사건 참조 — `{ id, title, occurredAt }`

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `id` | number | 사건 패널(A5)을 열거나 타임라인에서 강조할 때 | `event.id` |
| `title` | string | 링크 글자 | `event.title` |
| `occurredAt` | 시각 | 「10.06 착공식」 같은 날짜 표시 | `event.occurred_at` |

기사 요약 — A6 · A7 의 항목, A8 의 바탕

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `id` | number | 기사 마인드맵(A8 · A9)을 열 때. 목록과 상세가 같은 ID (Jira 42) | `article.id` |
| `title` | string | 기사 제목 | `article.title` |
| `publisher` | string | 언론사 이름. 모든 기사 화면에 보인다(PRD FR-2) | `article.publisher` |
| `publishedAt` | 시각 | 발행 시각 표시 · 정렬 | `article.published_at` |
| `category` | 카테고리 참조 · null | 기사의 대표 카테고리 표시. 대응 못 한 기사는 null | `article.category_code` → `category` |
| `summary` | string · null | 목록의 한두 줄 요약. AI 생성 표시를 붙인다. 분석 전이면 null | `article_mindmap.summary` |
| `url` | string | *원문 보기* 링크 | `article.url` |
| `mindmapStatus` | enum | *마인드맵 보기* 를 켤지 · 「분석 중」을 보일지 | 계산 (`api-internal.md` 6절) — `NONE` · `QUEUED` · `SUCCEEDED` · `FAILED` |

---

## 2. 엔드포인트

### A1. 카테고리 — `GET /api/v1/categories`

카테고리 선택 화면 · 사이드바에 쓴다. 7개를 MVP 개요 2-1 순서로 준다. 인자는 없다.

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `items[].code` · `items[].name` | 카테고리 참조 | 카테고리 탭 | `category` |
| `items[].issueCount` | number | 「이 분야의 이슈가 아직 없어요」를 보일지(0이면) | 계산 — 이 카테고리에 걸린 이슈 중 사건이 있는 것 수 (`issue_category`) |
| `items[].articleCount` | number | 분야별 기사 수 표시 | 계산 — 대표 카테고리가 이것인 투입 기사 수 |

```json
{ "items": [{ "code": "economy", "name": "경제", "issueCount": 3, "articleCount": 1520 }] }
```

### A2. 이슈 목록 — `GET /api/v1/issues`

카테고리별 이슈 목록과 홈 이슈 카드에 쓴다(PRD FR-4, Jira 41).

| 인자 | 타입 | 용도 |
|---|---|---|
| `category` | enum · 선택 | 이 카테고리의 이슈만. 없으면 전체. 없는 코드면 404 `CATEGORY_NOT_FOUND` |
| `page` · `size` | number · 선택 | 쪽 번호 · 크기 (`api.md` 1절) |

응답은 목록 모양이고 항목은 아래다. 사건이 하나라도 있는 이슈만 준다. 정렬은 마지막 사건 발생 시점 최신순(PRD FR-4 가정), 같으면 `id` 내림차순.

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `id` · `title` | 이슈 참조 | 카드를 누르면 이슈 화면, 카드 제목 | `issue` |
| `summary` | string · null | 카드의 한두 문장 | `issue.summary` |
| `categories` | array(카테고리 참조) | 카드의 분야 표시. 여러 개일 수 있다 | `issue_category` → `category` |
| `eventCount` | number | 「사건 8개」 | 계산 — 이 이슈의 사건 수 |
| `articleCount` | number | 「기사 23개」 | 계산 — 이 이슈 사건들에 묶인 투입 기사 수 (`article_event`) |
| `publisherCount` | number | 「언론사 5곳」 | 계산 — 그 기사들의 언론사 수 |
| `firstEventAt` · `lastEventAt` | 시각 | 기간 「08.04 ~ 10.09」, 정렬 | 계산 — 사건 `occurred_at` 의 가장 이른 값 · 늦은 값 |
| `lastEvent` | `{ id, title }` | 카드의 「최근 사건 · 인력 수급 우려」 | 계산 — `occurred_at` 이 가장 늦은 사건 |

```json
{
  "items": [{
    "id": 12, "title": "한빛반도체 미국 공장 건설", "summary": "한빛반도체가 텍사스 공장 투자를 늘리고 착공했다",
    "categories": [{ "code": "economy", "name": "경제" }],
    "eventCount": 8, "articleCount": 23, "publisherCount": 5,
    "firstEventAt": "2026-08-04T00:00:00+09:00", "lastEventAt": "2026-10-09T08:41:00+09:00",
    "lastEvent": { "id": 98, "title": "인력 수급 우려" }
  }],
  "page": 0, "size": 20, "totalElements": 1, "totalPages": 1
}
```

### A3. 이슈 헤더 — `GET /api/v1/issues/{issueId}`

이슈 화면 맨 위 헤더(PRD FR-20)에 쓴다. 인자는 주소의 `issueId` 하나. 응답은 A2 항목에서 `lastEvent` 만 뺀 모양이고 필드 뜻도 같다. 기간은 `firstEventAt` ~ `lastEventAt` 이다.

### A4. 타임라인 — `GET /api/v1/issues/{issueId}/timeline`

이슈 에볼루션 맵의 사건 노드를 그린다(F07, Jira 48). 이슈의 사건을 페이지 없이 한 번에 준다. 정렬은 `occurredAt` 오름차순, 같으면 `id` 오름차순.

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `issueId` | number | 어느 이슈의 타임라인인지 | 주소의 `issueId` |
| `events[].id` · `title` · `occurredAt` | 사건 참조 | 노드 이름과 가로 위치(발생 시점) | `event` |
| `events[].occurredAtBasis` | enum | 발생 시점을 본문에서 뽑았나(`EXTRACTED`) · 첫 기사 발행 시각으로 채웠나(`FIRST_PUBLISHED`). 뒤의 것이면 「추정」 표시를 붙일 수 있다 | `event.occurred_at_basis` |
| `events[].articleCount` | number | 노드에 마우스를 올리면 보이는 기사 수. 보도량을 세로축으로 쓴다면 이 값(Q15 미정) | 계산 — 이 사건의 투입 기사 수 |
| `events[].publisherCount` | number | 마우스를 올리면 보이는 언론사 수 | 계산 |
| `relations[]` | array | 사건 사이 선. P0 에서는 늘 빈 배열. P1(PRD FR-22, Q25)에서 `{ fromEventId, toEventId, type }` 으로 채운다 | `event_relation` |

사건 태그(#새 정보 등)는 F09 · F10 이라 없다. 언론사 필터(PRD FR-23)는 P1 이다.

```json
{
  "issueId": 12,
  "events": [{ "id": 91, "title": "공식 발표", "occurredAt": "2026-08-21T00:00:00+09:00", "occurredAtBasis": "EXTRACTED", "articleCount": 5, "publisherCount": 3 }],
  "relations": []
}
```

### A5. 사건 패널 — `GET /api/v1/events/{eventId}`

타임라인에서 사건 노드를 누르면 열리는 오른쪽 패널이다(F08, Jira 49). 인자는 주소의 `eventId` 하나.

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `id` · `title` · `occurredAt` | 사건 참조 | 패널 제목 · 날짜 | `event` |
| `summary` | string · null | 사건 요약. AI 표시 · 핵심 근거(PRD 5.4)는 `data-model.md` 5절 13번이 정해지면 더한다 | `event.summary` |
| `occurredAtBasis` | enum | A4 와 같다 | `event.occurred_at_basis` |
| `issue` | 이슈 참조 · null | 속한 이슈. null 이면 아직 이슈로 묶이지 않은 사건 | `event.issue_id` → `issue` |
| `articleCount` | number | 「관련 기사 4건」 | 계산 |
| `publishers` | array(string) | 이 사건을 보도한 언론사 전부(PRD FR-11). 순서는 아직 정하지 않았다 | 계산 — 투입 기사들의 `publisher` |
| `previousEvent` · `nextEvent` | 사건 참조 · null | *이전 · 다음 사건* 이동. 같은 이슈 안에서 발생 시점 순서로 앞뒤. 없으면 null | 계산 |

관점(PRD FR-24~26, P2)과 이 사건의 변화(F09 · F10)는 빠져 있다.

```json
{
  "id": 98, "title": "인력 수급 우려", "summary": "텍사스 공장에 필요한 엔지니어 수를 두고 보도가 엇갈렸다",
  "occurredAt": "2026-10-09T08:41:00+09:00", "occurredAtBasis": "FIRST_PUBLISHED",
  "issue": { "id": 12, "title": "한빛반도체 미국 공장 건설" },
  "articleCount": 4, "publishers": ["바른신문", "새벽타임즈"],
  "previousEvent": { "id": 97, "title": "착공식", "occurredAt": "2026-10-06T00:00:00+09:00" },
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

홈 · 카테고리의 최신 기사 목록이다(F01, Jira 42).

| 인자 | 타입 | 용도 |
|---|---|---|
| `category` | enum · 선택 | 이 대표 카테고리의 기사만. 없으면 전체 |
| `page` · `size` | number · 선택 | 쪽 번호 · 크기 |

응답은 목록 모양이고 항목은 기사 요약(1절)이다. 정렬은 발행 시각 최신순(PRD FR-2), 같으면 `id` 내림차순. `summary` 가 null 일 때 본문 첫 문장으로 대신할지는 본문 노출 범위(Q3)가 정해진 뒤에 본다.

```json
{
  "items": [{
    "id": 456, "title": "한빛반도체 텍사스 공장 첫 삽… \"2028년 양산 변함없다\"",
    "publisher": "가람일보", "publishedAt": "2026-10-06T10:12:00+09:00",
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

판정이 끝났는데(`eventMatchStatus` 가 `SUCCEEDED`) `issue` 가 null 이면 「아직 이슈로 묶이지 않았다」고 안내한다(PRD FR-30).

```json
{
  "id": 456, "title": "…", "publisher": "가람일보", "reporter": "김민정 기자",
  "publishedAt": "2026-10-06T10:12:00+09:00", "url": "https://news.example.com/a/456",
  "category": { "code": "economy", "name": "경제" },
  "summary": "…", "mindmapStatus": "SUCCEEDED", "eventMatchStatus": "SUCCEEDED",
  "event": { "id": 97, "title": "착공식", "occurredAt": "2026-10-06T00:00:00+09:00" },
  "issue": { "id": 12, "title": "한빛반도체 미국 공장 건설" }
}
```

### A9. 기사 마인드맵 — `GET /api/v1/articles/{articleId}/mindmap`

기사 마인드맵과 노드 상세 · 근거(F04 · F05, Jira 56)를 그린다. 마인드맵이 없으면 404 `MINDMAP_NOT_FOUND`.

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `articleId` | number | 어느 기사의 결과인지 | `article_mindmap.article_id` |
| `schemaVersion` | string | `content` 모양의 버전. 화면이 모르는 버전이면 옛 화면이 깨지지 않게 안내만 한다 | `article_mindmap.schema_version` |
| `generatedAt` | 시각 | 「AI 가 언제 만들었나」 표시 | `article_mindmap.generated_at` |
| `aiGenerated` | boolean | AI 생성 표시를 붙이라는 신호. 지금은 늘 true(PRD FR-7) | 고정값 |
| `content` | object | 노드 · 관계 · 근거. 저장한 jsonb 를 그대로 준다. 모양은 3절 | `article_mindmap.content` |

노드 상세의 관련 기사(PRD FR-7)는 A8 의 `event.id` 로 A6 을 불러 채운다.

```json
{ "articleId": 456, "schemaVersion": "mindmap-v0", "generatedAt": "2026-10-06T10:13:05+09:00", "aiGenerated": true, "content": { } }
```

### A10. URL 분석 요청 — `POST /api/v1/analysis-jobs`

상단 *생성* 에 지원 출처의 기사 URL 을 넣으면 부른다(PRD FR-32, Jira 57).

| 요청 필드 | 타입 | 용도 |
|---|---|---|
| `url` | string | 사용자가 넣은 기사 주소 |

| 응답 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `jobId` | number | A11 로 상태를 물을 때. 응답 머리의 `Location` 에도 있다 | 6하원칙 추출 작업의 `analysis_job.id` |
| `articleId` | number | 끝나면 A8 · A9 를 열 기사 | `article.id` |
| `status` | enum | 이미 끝났으면(`SUCCEEDED`) 기다리지 않고 바로 A9 를 연다 | `analysis_job.status` |

| 결과 | 상태 |
|---|---|
| 새로 분석을 건다 | 202 — `{ "jobId": 901, "articleId": 812, "status": "QUEUED" }` |
| 같은 URL 기사가 이미 있다 — 그 기사의 6하원칙 추출 작업을 준다 | 200 |
| URL 이 아님 · 지원하지 않는 출처 · 본문을 못 가져옴 · 요청이 너무 많음 | 400 · 422 · 502 · 429 (`api.md` 2절) |

- 같은 기사인지는 원문 링크가 같은지로 가른다(`article.url` 고유). 링크 정규화는 Jira 34
- 아직 투입하지 않은 데이터셋 기사의 URL 이면 그 자리에서 투입하고 분석을 건다(202). 제안이다(`data-model.md` 5절 8번)
- 본문은 A12 목록의 도메인일 때만 가져온다. 다른 호스트로 가는 리다이렉트는 따라가지 않는다 — 서버가 엉뚱한 주소를 부르게 하는 요청을 막으려는 것이다

### A11. 분석 상태 — `GET /api/v1/analysis-jobs/{jobId}`

「분석 중」 화면이 2초마다 부른다. `SUCCEEDED` 면 A9 를, `FAILED` 면 오류 안내를 연다. 이 작업은 6하원칙 추출 단계다. 사건 · 이슈 연결은 그 뒤에 이어서 돌고 화면은 A8 의 `eventMatchStatus` 로 본다.

| 필드 | 타입 | 용도 | 어디서 |
|---|---|---|---|
| `jobId` · `articleId` | number | 어느 작업 · 기사인지 | `analysis_job.id` · `article_id` |
| `stage` | enum | 어느 단계 작업인지. 지금은 늘 `EXTRACT`. 단계 표시(PRD FR-32 P1)를 넣으면 단계 목록을 더한다 | `analysis_job.stage` |
| `status` | enum | `QUEUED`(대기 또는 처리 중) · `SUCCEEDED` · `FAILED` | `analysis_job.status` |
| `createdAt` · `finishedAt` | 시각 · null | 기다린 시간 표시. 안 끝났으면 `finishedAt` 은 null | `analysis_job.created_at` · `finished_at` |
| `error` | object · null | 실패했을 때 `{ code, message }`. `code` 는 작업 실패 코드(`api.md` 2절), `message` 는 개발자용이라 화면에 그대로 보이지 않는다 | `analysis_job.error_code` · `error_message` |

```json
{
  "jobId": 901, "articleId": 812, "stage": "EXTRACT", "status": "FAILED",
  "createdAt": "2026-10-19T11:00:00+09:00", "finishedAt": "2026-10-19T11:00:40+09:00",
  "error": { "code": "LLM_TIMEOUT", "message": "GMS 응답이 60초 안에 오지 않았다" }
}
```

### A12. 지원 출처 — `GET /api/v1/sources`

「지원하지 않는 출처」 안내에 지원 언론사를 보여 준다. 어느 언론사를 받을지는 Q26 이라 모양만 정했다. 어디에 저장할지(설정 · 테이블)도 그때 정한다.

| 필드 | 타입 | 용도 |
|---|---|---|
| `items[].publisher` | string | 언론사 이름 |
| `items[].domain` | string | 받는 주소의 도메인. A10 이 본문을 가져와도 되는지 이것으로 가른다 |

```json
{ "items": [{ "publisher": "가람일보", "domain": "news.example.com" }] }
```

### A13. 통합 검색 — `GET /api/v1/search` (자리만)

⌘K 빠른 이동(PRD FR-3, Jira 43)이 부른다. 검색 범위 · 길이 제한 · 유형별 개수는 Jira 43 에서 합의한다.

| 인자 · 필드 | 타입 | 용도 |
|---|---|---|
| `q` (인자) | string | 검색어 |
| `issues[]` | 이슈 참조 | 이슈 결과. 누르면 이슈 화면 |
| `events[]` | `{ id, title, issueId }` | 사건 결과. 누르면 그 이슈의 타임라인에서 그 사건 |
| `articles[]` | `{ id, title }` | 기사 결과. 누르면 기사 마인드맵 |

```json
{ "issues": [{ "id": 12, "title": "…" }], "events": [{ "id": 98, "title": "…", "issueId": 12 }], "articles": [{ "id": 456, "title": "…" }] }
```

---

## 3. 마인드맵 `content` (제안)

노드 구조와 AI 출력 스키마는 Q33 에서 AI · FE 가 정한다. 그 전에 화면과 검증에 꼭 필요한 **근거 한 개의 모양**만 먼저 제안한다.

| 필드 | 타입 | 용도 |
|---|---|---|
| `text` | string | 근거 문장 원문. 노드 패널과 *근거 모아 보기* 에 그대로 보인다 |
| `paragraphIndex` | number | 몇 번째 문단인가. 본문을 줄바꿈으로 나누고 빈 줄을 뺀 순서, 0부터. 화면은 1을 더해 「4번째 문단」(PRD FR-7) |
| `sentenceIndex` | number | 그 문단 안 몇 번째 문장인가, 0부터. 원문 창에서 그 문장을 칠할 때 |

```json
{ "text": "13일 이사회에서 선임될 예정이다.", "paragraphIndex": 3, "sentenceIndex": 1 }
```

- `text` 는 그 문단에 글자 그대로 있어야 한다(PRD FR-5). API 가 저장 전에 대조해 맞지 않는 근거는 빼고, 근거가 하나도 남지 않은 노드도 뺀다(Jira 54 「근거 없는 항목을 채우지 않는다」). 노드가 하나도 안 남으면 W1 이 400 `EVIDENCE_NOT_IN_BODY` 를 돌려준다
- 근거 하나 때문에 추출 전체를 다시 돌리면 GMS 비용이 든다. 그래서 통째로 거절하지 않고 빼고 저장하자고 제안한다. 뺀 개수는 로그에 남겨 평가에 쓴다
- 문장을 나누는 규칙은 AI 쪽 코드 하나에만 둔다

아래는 6하원칙(F03) 기준으로 그려 본 예시일 뿐 계약이 아니다.

```json
{
  "root": { "title": "40대 여성 CEO 김유진, '실적 부진' 한샘의 구원투수될까" },
  "branches": [{
    "type": "WHO",
    "nodes": [{ "id": "n1", "label": "김유진", "summary": "IMM오퍼레이션즈본부장, 한샘 신임 대표 내정", "evidence": [] }]
  }],
  "edges": [{ "from": "n1", "to": "n2", "label": "내정" }]
}
```

`type` 후보: `WHO` · `WHEN` · `WHERE` · `WHAT` · `HOW` · `WHY`. 근거 없는 항목은 채우지 않는다(Jira 54).
