# 메인 흐름 없는 이슈 — 만들지 않고 목록에서도 뺀다 (2026-11-16, Jira S15P31A102-224)


## Context — 왜

사용자 요청: 「서브 흐름만 있는 이슈(예: 메인 흐름 0, 서브 흐름 3)는 이슈를 생성하지 않음」. 방법은 **목록에서 빼기 + 만들 때 막기 둘 다**로 정했다(2026-11-16 사용자 선택).

이슈 흐름 화면의 두 줄은 사건 역할(`event.role`)로 나뉜다 — MAIN = 메인 흐름(발생 · 결정 · 발표 · 결과 · 공식 조치), REACTION = 서브 흐름(반응 · 평가 · 여론) (`frontend/src/api/timeline.ts:5`, `issue/dto/TimelineEvent.java:25-27`). 메인이 없으면 「무슨 일이 있었나」 없이 반응만 이어져 이슈 흐름이 성립하지 않는다.

**운영 바탕값**(2026-11-16 14시, 읽기만): 보이는 이슈 **201개 중 10개**가 보이는 사건 중 MAIN 0 — #98 「국민의힘의 특검·국정조사 비판」(서브 6) · #139 조작기소 특검법 공방(5) · #161 증시 급락 책임론(5) 등, 대부분 정치권 공방. 문턱 없이 모든 사건으로 세면 286개 중 11개.

## 무엇을 / 왜 이 길로

1. **목록에서 빼기** — Jira 208(보이는 사건 3개 미만)과 **같은 자리 · 같은 방식**. 「보이는 MAIN 사건이 N개 이상인 이슈」만 A2 이슈 목록(행 · 전체 수) · A1 분야별 개수 · A13 검색의 이슈 칸에 낸다. 「보이는 MAIN」은 공개 기사 M건 이상인 MAIN 사건 — A4 타임라인의 메인 레인과 같은 집합이다(`IssueService.java:75`, `EventRepository.java:16-18`). 이슈 페이지(A3 · A4) · 이슈 링크(A5 · A8) · 관심 이슈(A23 · A25)는 그대로 — 208 이 404 대신 이 길을 고른 까닭(`SSOT.md` 9절 2026-11-15 줄)이 그대로 맞다. 나중에 MAIN 사건이 붙으면 다시 보인다.
2. **만들 때 막기** — 이슈를 실제로 만드는 곳은 backend `IssueResultHandler.create()` 다. AI 워커는 사건 역할을 모른다(ISSUE 메시지에 `role` 이 없다 — `ai/app/issue/run.py:24` `EVENT_KEYS`, `IssueMessageFactory.java:133-149`). 그래서 **backend 에서** CREATE 답의 `eventIds` 에 MAIN 이 문턱보다 적으면 이슈를 만들지 않고 NONE 처럼 끝낸다(작업 SUCCEEDED, 사건은 이슈 밖 그대로). 역할만 센다 — ISSUE 때 새 사건은 기사가 1건뿐이라 공개 기사 문턱을 걸면 거의 다 막힌다. ai 코드 · 메시지 계약 · ai 이미지는 그대로다.

설정 둘(기본 0 = 끔, 사이트 1). 208 처럼 **이름이 아니라 값으로 되돌린다**. 바닥이 기존 두 값(1)과 달리 **0** 이다:
- `newlearn.query.min-main-events` ← `QUERY_MIN_MAIN_EVENTS`
- `newlearn.analysis.issue.create-min-main-events` ← `ISSUE_CREATE_MIN_MAIN_EVENTS`

## 바꿀 파일

| 파일 | 무엇을 |
|---|---|
| `backend/.../common/PublicEventThreshold.java` | `minMainEvents()` · `mainEventSkip() = max(0, minMainEvents − 1)`(끔 0 일 때 `offset -1` 이 되지 않게 — PostgreSQL 은 OR 안의 평가 순서를 보장하지 않는다). 음수는 0 으로 올리고 경고. 생성자 인자 하나 추가 |
| `backend/.../common/PublicEventSql.java` | 새 조각 `ISSUE_HAS_ENOUGH_MAIN_EVENTS` — `(:minMainEvents = 0 or exists (select 1 from event main_event where main_event.issue_id = i.id and main_event.role = 'MAIN' and exists (공개 기사 M건 — 안쪽 :publicArticleSkip) offset :mainEventSkip limit 1))` |
| `backend/.../issue/IssueQueryRepository.java` | A2 전체 수에 새 조각, `LIST` · `LIST_WITH_THRESHOLD` **두 모양 모두** having 에 `count(distinct …) filter (where role = 'MAIN') >= :minMainEvents`(`LIST_WITH_THRESHOLD` 안쪽 select 에 `role` 추가), 바인딩 |
| `backend/.../category/CategoryQueryRepository.java` | A1 `issueCounts` 에 새 조각 · `counts()` 바인딩(조각 없는 기사 수 질의는 JdbcClient 가 남는 값을 무시) |
| `backend/.../search/SearchQueryRepository.java` | A13 `issues` 에 새 조각 · 바인딩(사건 칸은 그대로) |
| `backend/.../issue/IssueResultHandler.java` | `create()` 안 **두 검사(이번 사건 포함 · 후보 안, 128-135줄) 뒤 · `issues.save`(136줄) 앞**에 가드 — MAIN 수 < 문턱이면 이슈를 만들지 않고 `null` + INFO 로그(「메인 흐름 사건이 없어 이슈를 만들지 않는다 eventIds=…」). 반환형 `long` → `@Nullable Long`. 후보 밖 사건을 고른 답은 지금처럼 400 이다 |
| `backend/.../event/EventRepository.java` | `countByIdInAndRole(Collection<Long>, EventRole)` |
| `IssueController` · `CategoryController` · `SearchController` | Swagger 설명에 「메인 흐름 사건이 없는 이슈도 빠진다」 한 줄(FE 는 Swagger `[확정]` 을 읽는다) |
| `backend/src/main/resources/application.yaml` | 설정 둘, 주석(바탕값 · 값으로 되돌리기) |
| `infra/k8s/services/app/backend.yaml` | env 둘 `"1"`, 주석 |
| 시험 `MinPublicEventsApiIntegrationTest` | 클래스 설정에 `min-main-events=1` 을 더하고 픽스처 셋: MAIN 1 · 서브 2(보임) / MAIN 0 · 서브 3(빠짐 — A2 행 · 전체 수 · A1 · A13 이슈 칸, A3 · A4 는 200) / MAIN 은 있지만 공개 기사 2건뿐(빠짐). 기존 픽스처는 모두 MAIN 이라(220줄) 기존 단언 그대로 — **시험 앱이 늘지 않는다**. 이 클래스가 사이트 경로 `LIST_WITH_THRESHOLD` 를 지킨다 |
| 시험 (새) `MinMainEventsListShapeTest` | 기사 문턱 1(기본) · 메인 1 로 **`LIST` 모양**을 지킨다 — 행과 전체 수가 같고 서브만 이슈가 빠진다. 시험 앱이 하나 는다(CI DB 연결 상한 100 · 앱당 4 안인지 확인) |
| 시험 `IssueStageIntegrationTest` | 가드 켬: 모두 REACTION → 이슈 0개 · 작업 SUCCEEDED · 사건 `issue_id` null / MAIN 하나 섞임 → 만들어짐 / **모두 REACTION + 후보 밖 사건 → 여전히 400** / 가드 끔(기본) → 지금처럼 만들어짐 |
| 시험 `PublicEventThresholdTest` · `EventServiceTest` · `IssueServiceTest` | 생성자 인자 추가로 컴파일 맞추기, 0 · 음수 · `mainEventSkip` 경우 더하기 |
| 스펙 · 계약 | `docs/specs/F07-issue-assign.md` AC-6(「CREATE 면 새 이슈를 만들고」에 조건), `docs/data-model.md:284` · `docs/api-screen.md:99,245`(「사건 3개가 모이면 만든다」에 메인 조건), `docs/api-internal.md` 5절 ISSUE(backend 가 MAIN 없는 CREATE 는 만들지 않고 NONE 으로 본다, AI 워커는 바뀌지 않는다), `docs/api.md` 1절 + 끝의 바뀐 것 표, `docs/specs/F02-category-issue-api.md` · `F02-search-api.md` |
| `SSOT.md` | **9절 「뒤집은 것」 한 줄**(이슈는 사건 3개면 만든다 → MAIN 이 있어야 만들고 목록에 낸다), 10절 잰 값 한 줄 |
| `docs/testing.md` · `infra/server/eval/README.md:122` | 시험 수 · 「평가 자는 목록 규칙을 안 쓴다」 곁에 규칙이 하나 늘었다는 한 줄 |

## 작업 순서

- [ ] **C1** 실패하는 시험 먼저(목록 두 모양 · 만들기 가드 · 문턱 값) → 구현 → `backend_LINT` · `backend_TEST`, 고친 코드를 되돌려 새 시험이 **단언에서** 빨개지는지
- [ ] **C2** Swagger · 스펙 · 계약 문서 · SSOT 9절 · `backend.yaml` env
- [ ] MR → reviewer 조수 → 파이프라인 초록 → 머지 → 배포 태그 MR(backend 새 이미지) → 사이트 확인 → SSOT 10절 · Jira 완료 · 분야 브랜치 맞추기

## 안 바꿀 것

- **AI 워커**(`ai/`) — 코드 · 지시문 · 메시지 계약 · 이미지 모두 그대로. `CREATE_MIN_EVENTS = 3` 도 그대로
- 이미 있는 이슈 10개의 데이터 — 지우지도 사건을 떼지도 않는다. 목록에서만 빠진다
- 이슈 페이지(A3 · A4) · A5 · A8 이슈 링크 · 관심 이슈(A23 · A25) · A13 사건 칸 · ATTACH 후보(숨은 이슈도 후보로 남는다)
- 사건 역할 판정(MATCH_EVENT 의 MAIN/REACTION) · 화면 코드(FE)
- 이슈 목록 질의를 하나로 합치기 — Jira 210(발표 뒤). 이번엔 두 모양을 같이 고친다

## 리스크

- **조회가 조금 느려진다.** 운영에서 같은 질의를 3회 돌린 마지막 값으로 A2 전체 수 **27.6 → 37.7 ms**(버퍼 16,209 → 20,617쪽), 결과 **201 → 191**. A1 · A13 이슈 칸도 같은 조각이라 비슷하게 늘 것. 208 때처럼 밖에서 잰 응답 시간을 전후로 재고, 너무 느리면 값을 0 으로 되돌린다
- **두 모양 함정** — 사이트는 `LIST_WITH_THRESHOLD` 만 쓰고 기본값 시험은 `LIST` 만 돈다. 위 두 시험이 두 모양을 하나씩 맡는다
- **문턱 0 바인딩** — `:minMainEvents` · `:mainEventSkip` 을 조각을 쓰는 세 질의에 묶지 않으면 첫 요청에서 깨진다. 끔 · 켬 두 상태를 시험이 돈다
- **버린 CREATE 는 DB 에 흔적이 없다** — 판정 기록에는 까닭만 남고 결정 종류 · 지은 이름 · 요약은 없다(`IssueResultHandler.java:90-91`). 몇 번 버렸는지는 backend 로그(Loki)로만 센다. GMS 호출은 가드와 상관없이 새 사건마다 이미 돌아 **추가 비용은 없고, 잃는 것은 그 답의 내용**이다. 버린 REACTION 묶음은 이슈 밖에 남아 이어지는 반응 사건마다 같은 CREATE 가 반복해 버려질 수 있다
- **409 와 겹침** — 가드가 `assign` 앞이라, 모두 REACTION 인 CREATE 가 「그사이 다른 이슈에 들어간 사건」을 만나면 409 · 재시도 대신 SUCCEEDED 로 끝난다. 사람이 손으로 고쳤을 때만 생기는 경우다(`api-internal.md:367`)
- 이슈 분야별 개수(A1)가 줄어 화면 숫자가 바뀐다(지금 50 · 55 · 44 · 41 · 11 중 정치 쪽이 주로 줄 것)

## 어떻게 검증하나

1. **시험** — 위 시험 파일들. `backend_TEST` 전체 초록 + 되돌림 확인(조각을 빼면 「목록에서 빠짐」 단언이, 가드를 빼면 「이슈 0개」 단언이, `max(0, …)` 를 빼면 문턱 0 경우가 빨개짐)
2. **운영 읽기 대조(머지 전)** — 새 조각을 붙인 A2 수가 **191**(201 − 10), 빠지는 10개가 위 목록과 같음
3. **사이트(배포 뒤)** — 배포된 backend 이미지 판부터 확인(11-15 「설정은 들어갔는데 이미지가 옛 판」 교훈), A2 전체 수 191, #98 이 목록 · 검색 「국민의힘」 이슈 칸에 없고 `/api/v1/issues/98` · 타임라인은 200, A1 분야별 이슈 수 합 = A2 전체 수, 응답 시간 전후(관리자 PC, 15번 중앙값)
4. **만들기 가드** — 배포 뒤 Loki 에서 「메인 흐름 사건이 없어 이슈를 만들지 않는다」 줄 수와 그 작업이 SUCCEEDED · 새 이슈 없음을 하루 단위로 센다(일부러 운영 데이터를 만들지 않는다)
5. `SSOT.md` 10절에 전후 숫자 한 줄

## 되돌리는 법

| 무엇 | 어떻게 |
|---|---|
| 목록에서 빼기 | `backend.yaml` 의 `QUERY_MIN_MAIN_EVENTS` 값을 `"0"` 으로(이름은 두고) → Argo CD 가 backend 를 다시 띄움(1 ~ 2분). 숨었던 10개가 바로 다시 보인다 |
| 만들기 가드 | `ISSUE_CREATE_MIN_MAIN_EVENTS` 값을 `"0"` 으로 |
| 코드 | MR 되돌리기 |

🔴 목록 쪽은 데이터를 안 바꿔 완전히 되돌아온다. **만들기 가드는 되돌려도 그동안 막힌 묶음이 다시 생기지 않는다** — ISSUE 는 판정이 NEW 일 때만 걸리고(`api-internal.md` 3절), 다시 후보가 되는 것은 뒤에 생긴 사건보다 먼저인 이슈 밖 사건 중 가까운 10개뿐이다(`IssueCandidateFinder.java:109-119`). 15분 수집으로 이슈 밖 사건이 쌓이면 밀려난다.

## 리뷰에서 바뀐 것 (reviewer 조수, 2026-11-16)

| 처음 계획 | 바꾼 것 |
|---|---|
| 「기존 두 값과 같은 방식」 | 바닥이 0 이라 `mainEventSkip = max(0, N − 1)` 명시, 0 · 음수 시험 |
| 생성자 변경의 여파 없음 | `PublicEventThresholdTest` · `EventServiceTest` · `IssueServiceTest` 를 바꿀 파일에 |
| 가드를 `create()` 「앞」 | 두 검사 뒤 · `save` 앞, 반환형 `@Nullable Long`, 「REACTION 만 + 후보 밖 → 400」 시험 |
| 계약은 `api-internal.md` 만 | F07 AC-6 · `data-model.md` · `api-screen.md` 도 |
| SSOT 6절 | 9절 「뒤집은 것」 + 10절 |
| 개인 기록 결정 번호를 가리킴 | `SSOT.md` 9절 2026-11-15 줄로 |
| 「되돌리면 다시 판정된다」 | 만들기 가드는 되돌려도 막힌 묶음이 안 돌아온다 |
| 새 시험 클래스로 목록 시험 | 208 시험에 설정 · 픽스처를 더해 앱을 안 늘리고, `LIST` 모양 시험 하나만 새로 |
| GMS 가 헛돈다 | 추가 비용 없음 · 잃는 것은 답 내용 · 로그로만 셈 · 409 겹침 |
| (구현 뒤) 208 시험 기존 단언 그대로 | 보이는 메인 1 · 서브 2 이슈가 하나 늘어 전체 수 단언 2 → 3 (빠져야 할 이슈의 단언은 그대로) |
| (MR 리뷰) `api-internal.md` 「400 · 409 검사 뒤」 | 「400 뒤 · 아직 이슈 밖인지 보는 409 앞」, F07 AC-9 에 예외 한 줄 |
