# 문서 불일치 정리 · V10(사건 역할 기본값 지우기 · 반응 대상 사건 번호) · 주소별 요청 수 상한 · 사전 하루 한도

2026-10-29 계획. 사용자 「plan 으로 한 번에 해」.

## 무엇을 / 왜

- **문서 불일치**: 프론트 대조와 문서 전체 점검에서, 정했거나 구현이 끝났는데 「미정 · 보류 · 4건 · 아직 코드 없음」으로 남은 문구와, 같은 사실이 서로 다르게 적힌 곳이 나왔다. 처리는 문서 주인에 따라 나눈다
  - 백엔드가 관리하는 문서: 바로 고친다
  - PM 확인 문서(PRD · MVP 개요 · user-flow): MR 로 올려 PM 확인을 받는다
  - 프론트가 관리하는 UX 문서: 담당 티켓에 남긴다
- **V10**: 2026-10-28 에 정한 두 가지를 코드로 옮긴다
  - 사건 역할(role)의 DB 기본값 `MAIN` 을 지운다
  - 반응 대상 사건 번호(`reactsToEventId`)를 받아 저장하고, A4 이슈 타임라인에 실어 화면이 반응 점선을 그리게 한다
- **요청 수 상한 · 사전 하루 한도**: 로그인 없이 부르는 A14 가입 · A15 로그인 · A19 용어사전을 입구 Envoy 에서 IP 마다 막는다. 국립국어원 사전의 하루 한도(50,000건)는 앱이 실제 호출 수로 지킨다

## 정한 것 (사용자)

| 무엇 | 정한 내용 | 언제 |
|---|---|---|
| A6 사건 관련 기사 목록(`GET /api/v1/events/{eventId}/articles`) | 처음 5건(`size=5`) | 10-29 |
| A2 이슈 목록(`GET /api/v1/issues`) | 사건 0개 이슈의 `firstEventAt` · `lastEventAt` · `lastEvent` 는 null | 10-29 |
| A13 통합 검색(`GET /api/v1/search`) | MVP(PRD FR-3 P0 「빠른 이동」). 구현은 Jira 43 따로 | 10-29 |
| 검색 단축키 표기 | Ctrl+K(맥 ⌘K). ⌘ 는 맥 Command 키 | 10-29 |
| PRD | 고쳐도 된다 | 10-29 |
| 사건 역할 기본값 `MAIN` | 지운다 | 10-28 합의 · 10-29 |
| 반응 대상 사건 번호 | 넣는다(「이어서 넣기」). 후보 사건 5개 안에서만. 후보 밖이면 400 대신 null + 경고 로그(AI 팀장 제안). 점선은 같은 이슈이고 화면에 둘 다 보일 때만 | 10-28 |
| A19 용어사전 요청 수 | 입구에서 IP 당 1분 100건, 그리고 앱이 사전 하루 호출 45,000건(한도의 90%)을 넘으면 502 | 10-29 |
| A15 로그인 · A14 가입 요청 수 | IP 당 1분 20건 · 10건 | 10-29 |

## 계획에서 정한 것 (승인 때 함께 확인)

- 입구 상한의 429 는 새 오류 코드 `RATE_LIMITED` 로 한다. `TOO_MANY_REQUESTS` 는 이미 「같은 아이디로 5번 틀려 1분 잠김」 뜻과 화면 문구가 정해져 있어, 같은 코드를 쓰면 화면이 엉뚱한 안내를 띄운다. 입구 Envoy 가 만드는 응답이라 백엔드 `ErrorCode` 에는 넣지 않고 `api.md` 2절에 「입구가 만든다」로 적는다
- 반응 대상 사건 번호가 정수가 아니면(글자 · 소수) 400 대신 null 로 받는다(선택 값이고 화면이 같다). `MAIN` 사건이면 읽지 않는다. 새 칸은 대상 사건이 지워지면 null(`on delete set null`)
- A4 이슈 타임라인에는 대상이 같은 이슈의 사건일 때만 번호를 싣는다. 「화면에 둘 다 보이나」는 화면이 레인마다 사건을 고르는 규칙이라 화면이 판단한다. 이미 읽은 사건 목록으로 거르므로 쿼리는 늘지 않는다
- 사전 하루 호출 수는 Redis 에 한국 날짜 단위로 센다. 키는 `dictquota:<날짜>`(검색어 키 `dict:` 와 섞이지 않게), 만료는 2일이다
  - Redis 가 실패하면 세지 않고 부른다(안전장치일 뿐이고, 실패하면 캐시도 없다)
  - 사전 쪽 「하루」가 몇 시에 바뀌는지는 미확인이라, 한국 자정으로 두고 한도의 90%에서 멈춘다
- PRD 는 사용자가 짚은 두 곳(FR-11 사건 패널 관련 기사 4건 → 5건, ⌘ → Ctrl+K)만 본문을 고친다. 나머지 어긋남은 머리에 「이 PRD 뒤에 바뀐 결정」 표를 두어 MVP 개요 · SSOT 9절을 가리킨다. PRD 는 스스로 MVP 개요가 이긴다고 적고 있다(prd.md:15). AGENTS.md 규칙대로 MR 로 올려 PM 확인을 받는다

## 작업 순서 (MR 다섯)

- [x] **① 계약 문서 MR !370 머지** → dev(이미 열림: A6 사건 관련 기사 5건 · A2 이슈 목록 null · A13 통합 검색 MVP) — 머지 승인 대기 → 2026-10-29 머지
- [x] **② 문서 불일치 정리 MR**(백엔드 관리 문서) → dev — 아래 「② 고칠 곳」. !371 열림(머지 승인 대기) → 2026-10-29 머지
- [x] **③ PM 확인 MR**(PRD · MVP 개요 · user-flow) → dev, PM 확인 뒤 머지 — 「③ 고칠 곳」. !372 열림(PM 확인 대기). MR 템플릿 머리의 기능 번호 표(F12 · F13 확정)도 같이 고쳤다 → 사용자가 PM 확인 항목을 확인(2026-10-29), 머지
- [x] **④ 백엔드 MR**(V10 · 반응 대상 사건 번호 · 사전 하루 한도 · A6 Swagger 문구) → backend, 시험 먼저 — 「④」 → !374 → backend, !376 → dev, 태그 !378 로 2026-10-29 12:34 사이트 반영(Flyway v10)
- [x] **⑤ 인프라 MR**(요청 수 상한) → infra — 「⑤」 → !373 · !380 으로 반영했으나 local 상한이 실측에서 무효 → 계획을 다시 세움(`docs/plans/2026-10-29-ratelimit-global.md`), global 로 2026-10-29 12:58 반영
- [x] 프론트 UX 문서(EXPERIENCE.md) 어긋남은 프론트 Jira 104 「프로토타입 마지막 수정(v21)과 EXPERIENCE.md 반영」에 댓글로 남긴다 — 2026-10-29 남김. `frontend` 브랜치는 5건 · 통합 검색 화면을 이미 반영해, 남은 것은 A13 「보류」 문구와 F12 · F13 「제안」 둘
  - 통합 검색 「MVP 미정」 · 사건 패널 기사 4건(EXPERIENCE.md:66 · :252 · :258)
- [x] (사용자 지시 뒤) backend · infra → dev → 태그 MR → 사이트 확인 · 측정 → 2026-10-29 완료(측정은 `SSOT.md` 10절)

④ · ⑤ 의 계약 · 데이터 모델 문서 변경은 그 MR 에 같이 담는다(코드와 문서가 함께 들어가게). ② 는 ④ · ⑤ 가 고칠 절(반응 대상 · 사건 역할 · 요청 수 상한 · 사전 한도)을 건드리지 않는다. 문서 파일이 겹쳐서 나란히 돌리지 않고 이 세션에서 차례로 한다.

## ② 고칠 곳 — 백엔드 관리 문서 (문서 점검의 「확실함」 항목)

- `SSOT.md`
  - 8절 「이슈가 카테고리 여러 개에 걸치나」 뒷부분을 지운다. 10-29 에 「하나」로 정했다
  - 「NewsData 구독 뒤」가 낡았다
  - 배포 속도 · 임베딩 줄에서 6 · 3 · 10절과 겹치는 부분을 덜어 남은 것만 둔다
  - 표를 끊는 빈 줄(354줄)을 지운다
  - 「F01~F11」(6줄) → F01~F13
  - 5절 A19 용어사전 키 「넣는다」 → 넣었다(10-29 사이트 200)
- `AGENTS.md`
  - 기능 번호 범위를 F01~F13 으로 고친다
  - 확정 기능 목록에서 F05 「노드 상세 및 근거 확인」을 뺀다(MVP 개요에서 추후)
  - F12 「회원 · 관심 분야」 · F13 「용어사전」을 SSOT 9절대로 적는다
- `.claude/stack.md`: 277줄의 「F01~F11」
- `docs/api.md`
  - 머리 「아직 코드가 없다」
  - 흐름 A 의 A6 사건 관련 기사 「size=4 · 4건」 → 5
  - 4절 FE 2 · 4번을 「풀림」 한 줄로 바꾼다. 번호는 다른 문서가 가리켜 남긴다
  - Jira 표 30 · 35 · 40 · 102 메모를 「2026-10-xx 구현」으로
  - 예시 오류 문장(84줄)을 실제 문장으로
- `docs/api-screen.md`
  - `NOT_ANALYZABLE` · `NO_EVENT` 「W1 구현 때부터 나온다」(59 · 239줄) → 지금 형
  - A5 사건 패널 용도 「관련 기사 4건」 → 5
  - A2 이슈 목록 `sort`: 사건 0개 이슈는 맨 뒤(`nulls last`, 코드와 맞춤)
  - A2 null 줄의 「위 「사건 0개」」가 가리키는 곳을 바로잡는다
  - A13 통합 검색 「⌘K」 → Ctrl+K(맥 ⌘K)
  - 프로토타입 「v15 까지」 → v21
  - 472줄의 닫힌 질문 가리킴을 고친다
- `docs/data-model.md`
  - 머리 「테이블은 아직 하나도 없다」
  - 5절 7 · 8번(정한 것)을 미정 목록에서 빼고, 2번 「지금 가정」의 결정을 본문으로 옮긴다
  - 「1만 7천 건」 문구는 SSOT 3절 실측(약 22만)을 가리키게 한다(측정 조건은 둔다)
  - 회원 입력 길이(아이디 4~20 · 비밀번호 8~64 · 이름 20)를 코드와 맞춘다
  - 프로토타입 「v15」 → v21
- `docs/specs/F08-event-panel-api.md`: AC-5 `size=4` → 5
- `docs/backend-convention.md`: 「엔티티 14개」를 실제 개수로(고칠 때 센다), 예시 오류 문장
- 「확인 필요」 항목은 고치지 않고 MR 본문에 「남김」으로 적는다
  - ISSUE 「(제안)」 표시, AI 질문 9번, 마인드맵 렌더링 라이브러리, 공통 규칙의 FE 확인 등

## ③ 고칠 곳 — PM 확인 MR

- **PRD**(`_bmad-output/planning-artifacts/prds/prd-S15P31A102-2026-10-14/prd.md`)
  - 본문: FR-11 사건 패널 관련 기사 4건 → 5건, ⌘K · ⌘\ → Ctrl+K · Ctrl+\(맥 ⌘)
  - 머리에 「이 PRD 뒤에 바뀐 결정」 표를 둔다. 항목마다 근거 문서를 가리킨다
    - 카테고리 5개
    - 로그인 · 북마크 · 관심 이슈 MVP
    - 가입은 아이디 · 비밀번호
    - 사용자 URL 입력(FR-32) 뺌
    - 메인 흐름 = 사건 역할(Jira 130 「판정 결과의 사건 역할 · 타임라인 레인」)
    - 용어사전 MVP
- **MVP 개요**(`docs/mvp-overview.md`)
  - F12 「회원 · 관심 분야」 · F13 「용어사전」의 「제안」 → SSOT 9절대로 MVP
  - F02 「카테고리별 뉴스·이슈 조회」 범위에 빠른 이동(A13 통합 검색)
  - 용어사전 「단축키나 버튼」 → 버튼(EXPERIENCE 기준)
- **user-flow**(`docs/user-flow.md`): 카테고리 5개, Ctrl+K(맥 ⌘K), URL 입력 뺌, 마인드맵 가지 4개

## ④ 백엔드 MR — 바꿀 파일

- 새 `backend/src/main/resources/db/migration/V10__event_role_no_default_reacts_to_event.sql`
  - `alter table event alter column role drop default`
  - `add column reacts_to_event_id bigint references event (id) on delete set null`
- `event/Event.java`: `reactsToEventId` 칸 · 생성자 인자. 주석 「화면 API 로 내보내지 않는다」를 고친다
- `event/MatchEventResult.java`
  - `NewEvent` 에 `@Nullable Long reactsToEventId` 를 더한다
  - REACTION 일 때만 읽고, 정수가 아니면 null
- `event/MatchEventResultHandler.java`: `create` 에 작업을 넘긴다. 보낸 후보 안이면 저장하고, 밖이면 null + WARN(`CandidateEventFinder.read` 재사용)
- `issue/dto/TimelineEvent.java` · `issue/IssueService.java`
  - `@Nullable Long reactsToEventId` 를 더한다. 이미 읽은 같은 이슈 사건 번호 안일 때만 싣는다
  - 「관계 필드는 두지 않는다」 주석을 고친다
- 새 `dictionary/DictionaryQuota.java`
  - Redis Lua 로 INCR 과 만료를 함께 한다(`auth/LoginAttemptGuard.java` 와 같은 방식)
  - 설정값 `newlearn.dictionary.daily-limit`(기본 45000)
- `dictionary/DictionaryService.java`: 사전을 부르기 직전(캐시에 없을 때)에 한도를 보고, 넘으면 502 `DICTIONARY_UNAVAILABLE`
- `event/EventController.java`: A6 사건 관련 기사 목록 Swagger 「처음 4건 size=4」 → 5건
- 시험
  - **role 없이 사건을 넣는 시험 데이터 6곳**에 role 을 넣는다
    - `ArticleApiFixtures` · `CategoryIssueFixtures` 는 옛 스키마(V2 · V6 · V7)의 스키마 시험도 부르므로 「role 칸 전 스키마용」을 따로 둔다
    - `EventApiFixtures` · `EventMatchIntegrationTest.event` · `IssueStageIntegrationTest.event` · `IssueTimelineQueryTest`
  - `InterestIssueSchemaTest`: 버전 목록에 "10", 「한 번만 적용」 · 행 비교 단계는 `target("9")`
  - `CoreMappingTest`: 생성자 인자
  - `MatchEventResultTest`: `NewEvent` 기대값
  - 새 시험
    - V10 뒤 role 없이 넣으면 거절된다
    - 반응 대상 사건 번호: 후보 안이면 저장, 후보 밖 · 정수 아님은 null(경고 로그), `MAIN` 은 읽지 않음
    - A4 이슈 타임라인: 같은 이슈면 번호, 다른 이슈 · 이슈 밖이면 null
    - 사전 하루 한도를 넘으면 502 이고 사전을 부르지 않음. 한도 키는 검색어 키와 섞이지 않음
- 문서(같은 MR)
  - `docs/api-internal.md` 5절: newEvent 칸 · 받을 때 표 · 「이야기 중」 지움
  - `docs/api-screen.md`
    - A4 이슈 타임라인: 칸 줄 · 「사건 사이 선을 그리지 않는다」 → 반응 점선 규칙 · 예시
    - A19 용어사전: 하루 한도 502
  - `docs/data-model.md`
    - event: role 기본값 문구 · 새 칸 줄 · ER 그림에 role · reacts_to · reacts_to_event_id · 선 문구
    - 5절 19번을 지운다
  - `SSOT.md`
    - 8절 사건 역할 기본값 · 반응 대상 두 줄을 지운다
    - 9절에 「반응 점선을 그린다(2026-10-20 「선 없음」을 고침)」
  - `docs/glossary.md`: 반응 대상 용어 · 사건 관계 줄
  - 스펙
    - `docs/specs/F06-event-match.md`: AC-12 · AC-13
    - `docs/specs/F07-issue-timeline-api.md`: AC-4
    - `docs/specs/F07-issue-assign.md`: 40줄
    - `docs/specs/F12-bookmark-interest-api.md`: V1~V10
    - `docs/specs/F13-dictionary-api.md`: 하루 한도 AC
  - 계획 문서 `docs/plans/2026-10-29-docs-v10-ratelimit.md`(이 파일)

## ⑤ 인프라 MR — 바꿀 파일

- `infra/k8s/services/app/routes.yaml`: HTTPRoute `app` 에 이름 붙인 규칙 셋을 더한다. `/api` 규칙은 그대로 둔다
  - `dictionary`: `/api/v1/dictionary` Exact, 메서드 조건 없음. HEAD 로 돌아가는 길을 막으려는 것이다
  - `login`: `/api/v1/auth/login` Exact + POST
  - `signup`: `/api/v1/members` Exact + POST. `GET /api/v1/members/me` 는 걸리지 않는다
- 새 `infra/k8s/services/app/ratelimit.yaml`: `BackendTrafficPolicy` 셋. `targetRefs.sectionName` 으로 규칙마다 붙인다
  - `rateLimit.local` 에 `sourceCIDR` `Distinct` `0.0.0.0/0`, 각각 1분 100 · 20 · 10
  - `responseOverride` 는 `source: Local` 로 Envoy 가 만든 429 만 바꾼다. 백엔드의 로그인 잠금 429 는 그대로 통과한다
  - 바꾼 응답: `application/problem+json`, `code: RATE_LIMITED`, `Retry-After: 60`
- `infra/k8s/services/app/kustomization.yaml`: 새 파일 한 줄
- `infra/k8s/services/data/redis.yaml`:38 — 없는 절 「Infra 와 정한다」 가리킴을 고친다
- 문서(같은 MR)
  - `SSOT.md`
    - 6절 입구에 「주소별 요청 수 상한」 한 줄(Envoy 1개라 local 이 정확, 손님 IP 는 Envoy 가 직접 본다 — 10-29 접근 로그에서 공인 주소 41개 확인)
    - 8절 API 인증 줄을 지우고 9절에 결정
  - `docs/api.md`
    - 2절 `RATE_LIMITED` 429(입구가 만든다, 화면 「요청이 많아요. 잠시 뒤 다시 시도해 주세요」)
    - 1절 인증
  - `docs/api-screen.md`: A14 가입 · A15 로그인 · A19 용어사전에 상한 · 429

## 안 바꿀 것

- A13 통합 검색의 구현(Jira 43 — 따로 계획)
- 프론트 코드 · UX 문서(EXPERIENCE.md 는 티켓에 남기기만)
- 이미 적용된 V1 ~ V9(V8 은 그대로 두고 V10 에서 고친다)
- 인증 · 세션 코드(`SecurityConfig` · 로그인 잠금)
- global 요청 수 상한 · 별도 Redis(Envoy 1개라 필요 없음)
- `reacts_to`(반응 대상 한 줄 글) 칸 — 그대로 둔다
- 문서 점검의 「확인 필요」 항목, 하루 처리 상한 · 기반 만들기 도구(SSOT 8절)

## 리스크

- **local Distinct**: 공식 문서끼리 어긋난다. v1.9 과제 문서는 「안 됨」, v1.4 · v1.9.2 릴리스 노트와 v1.9.2 소스는 「됨(IP 1만 개)」. 배포 뒤 서로 다른 두 네트워크(관리자 PC · EC2)에서 실측하고, 한 바구니로 묶이면 ⑤ 를 되돌리고 다시 계획한다
- **공유 IP**: 발표장처럼 한 공인 IP 를 여럿이 쓰면 바구니도 하나다. 동시에 여러 명이 가입하면 1분 10건에 걸릴 수 있다(사용자가 정한 숫자, 측정 뒤 다시 본다)
- Envoy 가 다시 뜨면 바구니가 비워진다(상한이 잠깐 느슨해질 뿐)
- **V10 기본값 지우기**: 배포 중 옛 Pod 도 role 을 늘 넣어서(엔티티가 모든 칸을 넣음) 깨지지 않을 것으로 보지만 추정이다. 사이트 사건은 0건이다
- 시험 데이터를 두 갈래(role 칸 전 · 후)로 나누는 일이 번거롭다. 한 곳이라도 빠지면 NOT NULL 로 깨지는데, 전체 시험이 잡는다
- 문서 변경이 많아 프론트 · AI 팀원의 열린 MR 과 겹칠 수 있다. 머지 직전마다 원격 dev · 열린 MR 을 다시 본다
- PRD · MVP 개요는 PM 확인 전에는 머지하지 않는다

## 어떻게 검증하나

- ②③: 고친 뒤 같은 문구(「F01~F11」 · 「size=4」 · 「4건」 · 「⌘K」 · 「아직 코드」 · 「v15」 · 「이야기 중」 · 「자리만」)를 저장소 전체에서 다시 찾아 0곳. 문서 안의 상대 링크가 깨지지 않았는지 본다
- ④
  - 시험 먼저 쓰고 구현 전에 단언에서 실패하는지 본다
  - 구현을 되돌리면 새 시험이 단언에서 실패하는지 본다(되돌림 확인)
  - 전체 시험 · 린트 통과 숫자를 적는다. reviewer 조수 리뷰를 받는다
  - 사이트에서 볼 것
    - Flyway `now at version v10`, 새 Pod 재시작 0
    - A4 이슈 타임라인에 `reactsToEventId` 칸(데이터가 없어 null)
    - A19 용어사전 200
    - health 1초 재기
- ⑤ 사이트 측정(데이터를 만들지 않는 요청만)
  - A19 용어사전: 관리자 PC 에서 1분 안에 101번 → 101번째가 429 이고 `code: RATE_LIMITED` · `Retry-After: 60`. 같은 때 EC2 에서는 200(다른 바구니)
  - A15 로그인: 없는 아이디로 매번 바꿔 21번 → 20번까지는 백엔드 응답(401 · 403), 21번째는 입구 429 `RATE_LIMITED`
  - A14 가입: 틀린 본문으로 11번 → 11번째가 429(계정을 만들지 않음)
  - `HEAD /api/v1/dictionary?q=…` 도 같은 바구니에 걸리는지 본다
  - `GET /api/v1/members/me` · 다른 `/api` 는 걸리지 않는지 본다
  - Argo CD Synced, health 1초 재기

## 되돌리는 법

- ①②③: 문서 MR 을 revert 한다
- ④: 코드는 revert 한다. 🔴 단, 사이트에 적용된 V10 은 고칠 수 없다. 되돌리려면 새 마이그레이션(V11: role 기본값을 다시 걸고 칸을 지움)을 쓴다. 사이트 사건이 0건이라 데이터 손실은 없다
- ⑤: 인프라 MR 을 revert 하면 Argo CD 가 정책 셋과 규칙 셋을 지운다. 그사이 상한은 바로 풀린다
