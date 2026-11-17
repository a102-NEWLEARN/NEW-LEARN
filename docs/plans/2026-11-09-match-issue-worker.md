# MATCH_EVENT · ISSUE 워커 — 판정 · 이슈 프롬프트와 큐 소비 (Jira S15P31A102-186)

## 무엇을 / 왜
AI 워커는 지금 EXTRACT · EMBED 만 소비해서, 덤프를 만들 때(로컬 B1)도 운영(11/12 적재 뒤 · 11/16 실시간)에서도 사건 · 이슈가 안 생긴다. `analysis.match_event` · `analysis.issue` 를 소비해 판정하고 W1 으로 결과를 보내는 두 워커를 `docs/api-internal.md` 4 · 5절 계약대로 더한다. 판정 프롬프트는 11/9 실험(`match-event-emul-v2`, 이슈 25개 · 판정 220번 · 실패 0)을 옮기고, 이슈 프롬프트는 계약(ATTACH · CREATE · NONE)에 맞게 새로 쓴다.

**확인한 것 (origin/ai f93413a · dev 15b431f)**
- 공용 틀 `QueueWorker` · `Stage` 와 EMBED 워커는 머지돼 있다(Jira 185, `ai/app/worker.py`, `ai/app/embed/`)
- 그런데 `QueueWorker.handle` 은 `payload["jobs"][stage.name]` 으로 작업 번호를 찾는다(worker.py:109-134). 판정 · 이슈 메시지는 `jobId` 하나만 있어서, 지금 틀로는 모든 메시지가 "깨진 메시지"로 W1 없이 ack 되고 **판정 줄 전체가 멈춘다**(api-internal.md:125 · 133)
- `make_envelope`(extract/run.py:31-49)은 EXTRACT 프롬프트 버전이 박혀 있고, `MockGms` 는 늘 마인드맵을 돌려준다 → 단계마다 따로 둔다(EMBED 의 `_envelope` 처럼)
- 판정 · 이슈 코드 · 상수는 ai/app 에 하나도 없다

## 바꿀 파일 (작업은 새 worktree `../S15P31A102-186`, 브랜치 `feat/ai/S15P31A102-186-match-issue-worker` ← origin/ai)
- `ai/app/worker.py` — `Stage` 에 `job_id(payload) -> int | None` 를 더한다. 기본은 지금처럼 `jobs[name]`(EXTRACT · EMBED 동작 그대로), 판정 · 이슈는 `payload["jobId"]`. `jobId` · `attempt` 가 없으면 지금처럼 기록하고 ack(api-internal.md:121). 있으면 내용이 틀려도 **반드시 W1 실패로 끝낸다**
- `ai/app/match_event/` (새) — EMBED 와 같은 모양
  - `prompt.py`: `PROMPT_VERSION = "match-v1"`. 시스템 프롬프트는 실험 v2 를 옮긴다(EXISTING · NEW 판정, title 40자 안 · label 2~10자 명사구 · summary 1~2문장 '-다' · role MAIN/REACTION 정의는 api-internal.md:299 문구 그대로 · reactsToEventId 는 후보 안에서만 · 공인 아닌 사람 실명 금지). 문서 머리에 실험 출처 · 결과 · 프롬프트 sha256 을 적는다(extract/prompt.py 처럼)
  - `run.py`: 메시지 → 사용자 글(article · extracted.summary/occurredAt/primaryEvent{text, evidence 글} · candidates · doNotName) → `llm.complete` → 검사 → 봉투. `OUTPUT_TRIES=2`, 실패 코드는 `LLM_OUTPUT_INVALID` · GmsError 코드 그대로 · 예외는 `INTERNAL`(형식 이름만). `match_event_stage(llm, model) -> Stage`(stream `analysis.match_event`, group `match_event`, name `MATCH_EVENT`)
  - `postprocess.py`: pydantic 검사 = 백엔드 400 규칙(api-internal.md:310-319)과 같은 것 + 프롬프트 규칙(길이 · 합니다체 · doNotName). 고르기: MAIN 이면 reactsTo · reactsToEventId null, NEW 면 eventId null, EXISTING 이면 newEvent null
  - `mock.py`: mock 모드 답(NEW, primaryEvent 로 이름 · 키워드, role MAIN) — 로컬 흐름 점검용
- `ai/app/issue/` (새) — 같은 모양
  - `prompt.py`: `PROMPT_VERSION = "issue-v1"`. 입력 event · candidateIssues(최대 5 × 최근 사건 5) · candidateEvents(최대 10). 규칙: 후보 이슈의 같은 흐름(같은 주체 · 쟁점이 이어짐)이면 ATTACH + 새 사건을 넣어 다시 쓴 요약, 아니고 같은 흐름 후보 사건이 2개 이상이면 CREATE(eventIds 에 이 사건 포함 3개 이상, 이슈 제목은 issue-summary-v4 규칙 — 쟁점 중심 · 공인 아닌 사람 실명 금지), 그 밖은 NONE. 요약은 한두 문장 '-다'(data-model.md:278)
  - `run.py` · `postprocess.py`(400 규칙 api-internal.md:341-346 그대로 미리 검사) · `mock.py`(후보 사건 2개 이상이면 CREATE, 아니면 NONE)
- `ai/app/config.py` · `ai/app/main.py` — `MATCH_EVENT_WORKER_ENABLED` · `ISSUE_WORKER_ENABLED`(기본 false), EMBED 의 `embed_plan` · `QueueWorker` · `watch` · `stop_all` 과 같은 방식으로 띄운다. gms 모드의 `GmsClient` 하나를 같이 쓴다. `/health` 에 `match_event_worker` · `issue_worker`(BLOCKED 면 503)
- `compose.yaml` · `.env.example` · `infra/k8s/services/ai/ai.yaml` — 두 변수를 EMBED 와 같은 꼴로 더한다(운영 기본 `"false"`. 켜는 것은 인프라가 덤프 적재 뒤에)
- `ai/tests/test_match_event.py` · `ai/tests/test_issue.py`(새), `ai/tests/test_worker.py` · `ai/tests/test_health.py`(더함)
- `docs/plans/2026-11-09-match-issue-worker.md` — 승인된 이 계획(.claude/stack.md §7)
- `SSOT.md` — 워커 절의 지난 문장("EMBED 워커는 아직 없다", SSOT.md:247)만 지금 상태로 고친다

## 작업 순서
- [x] 1. `Stage.job_id` + 판정형 메시지 처리 — `test_worker.py` 새 시험(jobId 메시지 처리 · 내용 틀려도 W1 실패 · jobId 없으면 ack) + 기존 EXTRACT · EMBED 시험 그대로 통과
- [x] 2. `match_event/` + `test_match_event.py` — 400 규칙 표마다 시험, 고르기, 재시도, 시간 초과, mock 답이 검사를 통과
- [x] 3. `issue/` + `test_issue.py` — 같은 방식
- [x] 4. 띄우기(config · main · health · compose · env · k8s) + 시험 — 플래그 꺼짐이 기본, 켜면 두 워커가 뜬다
- [x] 5. 평가(아래) 숫자를 계획 · MR 에 적고, SSOT 한 줄 · 계획 파일 · MR(→ ai)

## 평가 결과 (2026-11-09, gpt-6-luna, GMS 약 190번)
11/9 기반 분석 실험 입력을 워커 코드 경로(`run_match_event` · `run_issue`)로 다시 돌렸다(`output/newsdata_grouping/realui/eval_workers.py`).

| 단계 | 입력 | 결과 |
|---|---|---|
| 판정 `match-v1` | 시험 이슈 2개(오세훈 항소심 · 김정은 방중)의 사건 묶음 29개, 만든 순서대로 · 계약 모양 메시지 | 형식 실패 0. NEW 23 · EXISTING 6. 같은 입력의 실험 판정과 결정 28/29 · 역할 21/22 같음 |
| 이슈 `issue-v1` | 선정 24개 이슈의 사건 160개를 한데 섞어 만든 순서대로(후보 이슈 ≤5 · 이슈 밖 앞선 사건 ≤10) | 형식 실패 0. CREATE 20 · ATTACH 81 · NONE 59. 이슈 20개(기준 24) · 이슈에 든 사건 142/160. 임베딩 묶음 기준 같은 이슈 쌍 **정밀도 1.0 · 재현율 0.905** |

- 이슈 판정은 다른 이슈의 사건을 하나도 섞지 않았다(정밀도 1.0). 이슈가 안 생긴 4개는 모두 사건 3~4개짜리 작은 이슈다(솔리다임 IPO 중단 · 삼성전자·SK하이닉스 실적 · 젠슨 황 스파이 의혹 · 현대차 수소, 사건 13개). 나머지 5개 사건은 이슈 밖(NONE)으로 남았다(애매하면 NONE 규칙대로)
- 이슈 이름 예: 「오세훈 항소심 선고와 정치권 파장」 「바이낸스 해킹·가상자산 탈취 조사와 대응」 「조작기소·공소취소 특검 당론 채택 공방」

## 안 바꿀 것
- 백엔드 · API 계약(`api-internal.md`) · DB — 계약대로 맞추기만 한다. 계약이 이상하면 멈추고 묻는다
- EXTRACT(v4.14 고정, 발표까지) · EMBED 워커의 동작
- 운영 켜기 · 덤프 만들기 · 적재(인프라 · 데이터 몫, 이 MR 밖)
- `ai/experiments/`(MR !736) · `data/`

## 리스크
- **이슈 프롬프트는 처음 쓰는 것이다.** 실험은 임베딩 거리(0.40 · 7일)로 이슈를 묶었고 LLM 판정은 없었다. 묶음이 너무 크거나(엉뚱한 ATTACH) 이슈가 안 생길 수(NONE 만) 있다 → 평가로 확인하고, 애매하면 NONE 쪽으로 둔다
- **공용 틀 변경이 EXTRACT · EMBED 를 깨뜨릴 수 있다** → 기존 시험 전부 + 기본값은 지금 동작 그대로
- **실명 거르기는 메시지 글로만 한다.** 판정 메시지에는 본문이 없어 「이름(나이)」를 제목 · 요약 · 근거 문장에서만 찾는다
- **로컬에서 백엔드와 끝까지 못 돌린다**(이 PC 는 Docker 가 막힘). 계약은 백엔드 시험 fixture(`EventMatchIntegrationTest` · `IssueStageIntegrationTest`)와 같은 모양인지 시험으로 맞추고, 실제 왕복은 덤프 만들 때 처음 확인한다
- **평가 GMS 사용(약 200번)** — 돌리기 전에 승인받는다(evals 스킬)
- 일정: 샘플 덤프 11/10 · 최종 11/12. 1 · 2단계(판정)를 먼저 끝내 덤프 쪽이 쓸 수 있게 한다

## 어떻게 검증하나
- **게이트(ai/):** `uv run --locked ruff format --check .` · `uv run --locked ruff check .` · `uv run --locked pytest` 모두 통과
- **F06 판정(spec AC):** AC-4 입력(후보 0개여도 판정) · AC-7 `{reason, model, promptVersion}` · AC-8 · AC-12 · AC-13 → 400 이 될 답은 워커가 먼저 걸러 다시 묻고, 끝내 틀리면 `LLM_OUTPUT_INVALID` W1. 시험 이름: `test_match_rejects_*`(400 규칙마다), `test_match_main_drops_reacts_to`, `test_match_message_without_jobs_key_is_handled`
- **F07 이슈:** AC-5 · AC-6 · AC-7 · AC-8 → `test_issue_create_needs_three_events_including_this`, `test_issue_attach_must_be_candidate`, `test_issue_none_keeps_only_reason` 등
- **틀:** 판정 · 이슈 메시지가 실패해도 W1 을 보내고 그 뒤 ack(`test_*_failure_still_sends_w1`), 기존 `test_worker.py` · `test_embed.py` 그대로 통과
- **평가(GMS, 승인 뒤):** 11/9 실험 입력(`output/newsdata_grouping/realui/events_input.json` + EXTRACT 캐시)을 새 코드 경로로 다시 돌린다
  - 판정: 시험 이슈 2개(사건 묶음 30, 약 30번) — 실험 v2 결과와 결정(EXISTING/NEW) · 역할이 얼마나 같은지
  - 이슈: 24개 이슈 사건 160개를 만든 순서대로(약 160번) — CREATE · ATTACH 가 임베딩 묶음과 얼마나 맞는지(같은 이슈 쌍의 정밀도 · 재현율), NONE 비율
- **mock 모드:** `LLM_MODE=mock` 으로 두 워커가 검사를 통과하는 답을 내는지 시험

## 되돌리는 법
- 코드: MR 을 Revert 한다. 두 플래그 기본값이 false 라 머지돼도 켜기 전에는 돌지 않는다
- 켠 뒤 문제가 나면 인프라가 `MATCH_EVENT_WORKER_ENABLED` · `ISSUE_WORKER_ENABLED` 를 false 로 되돌린다. 이미 만든 사건 · 이슈 행은 백엔드 DB 에 남는다(🔴 워커가 지울 수 없다 — 덤프는 다시 만들면 되고, 운영은 켜기 전 확인이 필요)
