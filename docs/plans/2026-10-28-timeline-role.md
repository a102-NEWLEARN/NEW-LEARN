# 판정 결과 role · reactsTo 와 타임라인 레인, Jira 125 확인 반영

## 무엇을 / 왜
AI 팀장이 2026-10-28 MM 으로 두 가지를 제안했다. 하나는 타임라인 메인 · 서브 기준(13:10)이고, 다른 하나는 Jira 125 구현 전 확인 셋(13:14)이다. 사용자는 「그대로 진행 + 덧붙임」으로 답하기로 했다.
- 판정(MATCH_EVENT)이 새 사건을 만들 때 역할(`MAIN` · `REACTION`)과 반응 대상 한 줄(`reactsTo`)을 받아 저장한다.
- A4 `lane` 을 채운다. 지금은 늘 null 이다.
- 125 확인 셋은 계약에 적고, 판정 멈춤 경고를 40분으로 올린다.
- `reactsToEventId` · 메인 노드 10개 · 대상 없는 반응의 화면은 FE 와 정한 뒤 따로 한다.

## 정한 것 (사용자 답장 기준)

| 항목 | 정한 값 |
|---|---|
| `newEvent.role` | `MAIN` · `REACTION`(대문자, `api.md` 1절 값 목록 규칙). `NEW` 일 때 필수. 없거나 모르는 값이면 400(한 번 다시) |
| `newEvent.reactsTo` | `REACTION` 일 때 한 줄. 비었거나 U+0000 이면 null 로 받는다(화면에 안 나와 버려도 같음). `MAIN` 이면 읽지 않고 null |
| `EXISTING` 의 role · reactsTo | 읽지 않는다(지금의 짝 칸 규칙과 같음) |
| 저장 | `event.role` · `reacts_to`. 이름 · 키워드처럼 처음 값 고정 |
| A4 `events[].lane` | `MAIN` → `MAIN`, `REACTION` → `SUB`. 늘 값이 있다(null 없음) |
| `reacts_to` 노출 | 저장만 한다. A4 · A5 로는 내보내지 않는다(화면 쓰임은 FE 와 정할 때) |
| 다시 가져가기 | `XAUTOCLAIM` 10분 → 20분(워커 몫이라 문서만). 워커는 메시지 하나를 15분 안에 끝낸다 |
| 판정 멈춤 WARN | 30분 → 40분. 처리 중 죽으면 20분 + 15분이 30분을 넘어서다 |
| 실패 봉투 | GMS 를 안 부른 실패에도 `model` · `promptVersion` 을 채워도 된다. 실패면 API 가 저장하지 않는다 |
| 깨진 메시지 | 「`jobs` 에 내 단계 없음」은 정상이니 건너뛰고 ack. JSON 이 깨졌거나 `jobs` · `attempt` 자체가 없으면 로그(스트림 · 메시지 ID)를 남기고 ack |

## Jira
- 새 BE 티켓을 만든다. 제목은 「[BE] 판정 결과 role · reactsTo 저장과 타임라인 레인 — AI 제안 반영」이다.
- 설명 첫 줄에 공동 담당(강하린 · 김주우)을 적는다.
- 라벨은 `be` · `newlearn-mvp` · `pair`, 스토리 포인트는 3, 담당자는 김주우다.
- 부모 · 스프린트는 Jira 40 과 같게 한다. 키는 브랜치 이름에 넣는다.

## 바꿀 파일

**MR 1 — 계약 문서 → dev** (브랜치 `docs/backend/S15P31A102-130-timeline-role-contract`, 링크를 팀장 답장에 쓴다)
- `docs/api-internal.md`
  - 3절: 다시 가져가기 20분 · 워커 15분 상한 · 판정 멈춤 40분 · 깨진 메시지 처리
  - 5절: `newEvent` 행에 `role` · `reactsTo`, 「받을 때」 표에 role 400 · reactsTo null 행, 봉투 표 아래 실패면 `model` · `promptVersion` 을 저장하지 않음
- `docs/api.md`: 4절 AI 9번을 20분으로
- `docs/api-screen.md`: A4 `lane` 행(기준 · 늘 값)과 예시 JSON
- `docs/data-model.md`: event 표에 `role` · `reacts_to` 칸, 레인 기준 문단(292행 근처), 5절 11번을 정함으로
- `docs/specs/F06-event-match.md`: AC-3 을 40분으로, AC-12 에 role · reactsTo
- `docs/specs/F07-issue-timeline-api.md`: AC-4 를 lane 계산으로
- `SSOT.md`: 8절 「메인 · 서브 기준」 줄을 지운다(사실은 위 문서로)

**MR 2 — 코드 → backend** (브랜치 `feat/backend/S15P31A102-130-timeline-role`)
- `backend/src/main/resources/db/migration/V8__event_role.sql`: `role text not null default 'MAIN'`(check `MAIN` · `REACTION`), `reacts_to text`
- `backend/src/main/java/kr/io/newlearn/event/`
  - `EventRole.java`(새 enum)
  - `Event.java`: 칸 둘 · 생성자
  - `MatchEventResult.java`: `NewEvent` 에 role · reactsTo 읽기. 기존 `text()` · `invalid()` 를 쓴다
  - `MatchEventResultHandler.java`: `create` 로 넘긴다
- `backend/src/main/java/kr/io/newlearn/issue/`
  - `IssueService.java`: `timeline` 의 `null` 자리를 role 로 계산
  - `dto/TimelineEvent.java`: 주석을 고치고 `@Nullable` 을 뗀다
- `backend/src/main/java/kr/io/newlearn/analysis/match/MatchDispatcher.java`: `STUCK_AFTER` 를 40분으로, 주석의 10분을 20분으로
- 시험
  - `EventMatchIntegrationTest`
    - NEW 결과 헬퍼(803행 근처)에 `role` 을 넣는다
    - 더하는 시험: role 없음 · 모르는 값이면 400, MAIN + reactsTo 면 null, REACTION + 빈 reactsTo 면 null, EXISTING 의 role 은 무시, 멈춤 경고 39분 없음 · 41분 있음
  - `IssueTimelineApiIntegrationTest`: lane `MAIN` · `SUB`(지금 `isEmpty` 단언을 바꿈)
  - `MatchEventResultTest` · `CoreMappingTest`: 생성자 변경을 따라간다

**MR 3 이후**: 지금까지와 같은 흐름이다. backend → dev, 태그 MR(사이트), 분야 브랜치 넷 맞추기.

## 작업 순서
- [x] Jira 티켓을 만든다(S15P31A102-130). 스토리 포인트가 들어갔는지 JQL 로 본다
- [ ] MR 1(계약 문서 → dev)을 올린다. 파이프라인 w0:rules 통과를 보고 링크를 사용자에게 준다(머지는 사용자 지시 뒤)
- [ ] 시험을 먼저 써서 빨간 것을 본다
- [ ] V8 · 엔티티 · 판정 · 레인 · 경고를 구현하고 커밋한다
- [ ] `/verify`(되돌림 확인 포함) → MR 2 → backend
- [ ] backend → dev → 태그 MR → 사이트 확인: health 1초 재기, Flyway v8, Swagger lane

## 안 바꿀 것
- `reactsToEventId` · 메인 노드 10개 · 대상 없는 반응의 화면(FE 와 정한 뒤)
- EXTRACT 결과 · 메시지 모양, 후보 찾기(`CandidateEventFinder`), ISSUE 단계(Jira 40)
- 워커 코드(`ai/`, AI 팀 몫)
- 이미 적용된 마이그레이션 V1 ~ V7, A5 사건 패널 응답, 인증 · 권한 코드
- 개발용 기사 적재 도구 계획(이 일 뒤에 다시 세운다)

## 리스크
- **AI 가 소문자 `main` 으로 보내는 경우**: 400 → 한 번 다시 → FAILED 가 된다. 답장에서 대문자를 부탁한다. 판정 프롬프트가 아직 없고 사이트 판정도 0건이라, 지금 깨질 흐름은 없다
- **role 기본값 `'MAIN'`**: 기존 행(사이트 0건)과 시험 픽스처(`insert into event` 5곳)가 그대로 돈다. 코드는 생성자로 늘 role 을 넣는다
- **A4 lane 이 null → 늘 값으로 바뀜**: FE 는 null 을 다루고 있고 아직 A4 를 부르지도 않는다. 깨질 것이 없다
- **사이트에 V8 적용**: 열 추가 · 기본값이라 짧다. 교체 중 health 를 1초마다 잰다

## 어떻게 검증하나
- 새 시험이 구현을 되돌리면 단언에서 실패하는지 본다(`/verify` 1-2단계). 전체 시험 수가 늘었는지 본다
- 판정 · 레인은 실제 DB 를 쓰는 통합 시험으로 확인한다
  - W1 NEW(REACTION) → event 행의 `role` · `reacts_to`
  - A4 `lane` 이 `SUB`
- 사이트에서 확인할 것
  - Flyway 「now at version v8」
  - Swagger A4 `lane`
  - 교체 중 health 실패 0
  - A1 · A2 GET 200
- 문서 MR 은 파이프라인 w0:rules 통과로 본다

## 되돌리는 법
- **문서**: revert MR 을 연다
- **코드**: 태그 MR 로 backend 를 이전 태그(`1f621d60`)로 되돌린다. V8 은 열만 더해서 옛 코드도 그대로 돈다. 옛 코드는 role 칸을 모르지만 기본값이 있어 insert 가 성공한다. 열을 지워야 하면 새 마이그레이션(V9)으로 하고, 적용된 V8 은 고치지 않는다
