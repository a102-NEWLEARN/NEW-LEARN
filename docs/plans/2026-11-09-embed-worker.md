# 운영 EMBED 워커 — 기사 벡터를 만들어 W1 으로 보낸다 (Jira S15P31A102-185)

## 무엇을 / 왜

운영 AI 워커는 EXTRACT 만 처리해, B1 을 걸어도 EMBED 작업이 `QUEUED` 로 남고 같은 사건 판정(MATCH_EVENT)이 걸리지 않는다. 11/12 AI 결과 덤프 뒤 운영 B1 · 11/16 실시간 수집에서 새 기사가 사건 후보를 받으려면 EMBED 가 돌아야 한다. 덤프 벡터와 같은 기준(BGE-m3-ko, **제목 + 줄바꿈 + 본문 앞 800자**, 정규화)으로 `analysis.released` 의 그룹 `embed` 를 읽고 W1 으로 `{ model, dimension, vector }` 를 보낸다. **코드는 꺼진 채로 배포하고, 덤프 적재 · 큐 점검 뒤 인프라와 같이 켠다.** 판정 · 이슈 워커는 S15P31A102-186.

## 바꿀 파일

- `ai/app/worker.py` — 큐 읽기 · ack · 다시 가져가기 · W1 보내기를 단계와 무관한 틀(`QueueWorker`)로 나눈다. 틀은 단계마다 다른 네 가지를 받는다: 처리 함수(메시지 → W1 봉투), 실패 봉투 만들기, 처리 시간 초과 때의 실패 코드, 진단 로그. EXTRACT 는 지금 동작(처리 마감 778초 = 900 − W1 예비 122초, `GmsAuthError` → BLOCKED, W1 뒤 ack, `calls` · `usage` 로그)을 그대로 옮긴다. 스트림 · 그룹 · 단계 이름은 인자로, claim 커서는 워커 인스턴스마다 따로
- `ai/app/embed/__init__.py` · `ai/app/embed/run.py`(새) — 입력 글 · 결과 봉투 · 실패 봉투
  - 입력: 원문 `title` + LF 한 개 + 원문 `body` 앞 800 Python 문자. strip · HTML 정리 · EXTRACT 전처리를 하지 않는다(덤프 `embedding_text` 와 같게). `title` · `body` 가 문자열이 아니면 `""` 로 본다(덤프의 `or ""` 와 같게). 입력이 비어도 실패로 끝내지 않고 그대로 인코딩한다 — B2 가 빈 본문을 막고, 덤프도 같은 규칙이다
  - 결과: `model` = `dragonkue/BGE-m3-ko`(덤프와 같은 값, 장민준 제안 2026-11-09), `promptVersion` = null, `dimension` = 1024, `vector` = JSON 숫자 목록. 보내기 전에 1024개 · 유한한 수 · float4 범위 · 길이 1(오차 1e-3)을 확인하고, 아니면 `FAILED` · `INTERNAL`
  - 인코더 예외 · 처리 시간 초과도 `INTERNAL`(API 가 1분 뒤 한 번 더 건다, `api.md` 2절). `LLM_*` 코드는 쓰지 않는다
- `ai/app/embed/model.py`(새) — sentence-transformers 로 `EMBED_MODEL_PATH`(기본 `/models/BGE-m3-ko`, init 컨테이너가 판 7074d66 으로 받아 둔 폴더)를 읽는다. CPU · float32 · `normalize_embeddings=True` 뒤 float32 로 다시 정규화(덤프와 같게). torch CPU 스레드 수를 env `EMBED_TORCH_THREADS`(기본 2, SSOT 10절 실측 조건)로 고정. **인코딩은 스레드 하나짜리 실행기에서 한 번에 하나만** 돈다. 모델은 큐를 읽기 전에 그 실행기에서 한 번 읽고, 실패하면 EMBED 만 BLOCKED(고친 뒤 Pod 재시작으로 복구)
- `ai/app/config.py` — `EMBED_WORKER_ENABLED`(기본 false) · `EMBED_MODEL_PATH` · `EMBED_TORCH_THREADS`
- `ai/app/main.py` — EXTRACT · EMBED 를 같은 프로세스의 작업 둘로 띄운다. 큐 Redis 클라이언트는 워커마다 따로(블록 읽기 둘), 헬스용 짧은 연결은 그대로. 종료는 두 워커에 먼저 stop 을 보내고 **공통 예산 하나로 함께** 기다린다(k8s grace 30초 − preStop 10초를 넘지 않게 15초). `EMBED_WORKER_ENABLED=false` 면 EMBED 는 띄우지 않고 상태 OFF. mock 모드(`WORKER_ALLOW_MOCK=true`)면 실제 모델 대신 가짜 인코더(고정 1024차원 단위 벡터)
- `/health`(`main.py`) — 본문에 `embed_worker` 상태를 더한다. **켜진 EMBED 가 BLOCKED 이거나 작업이 예상 밖으로 끝나면 503**(readiness 가 내려가 `NewlearnServiceDown` 경보로 보인다). liveness 는 TCP 라 Pod 를 재시작하지 않아 EXTRACT 는 계속 돈다. 꺼진(OFF) EMBED 는 상태 코드에 영향 없음
- `compose.yaml` — `ai` 서비스에 `WORKER_ALLOW_MOCK` · `BACKEND_URL` · `INTERNAL_API_KEY` · `EMBED_WORKER_ENABLED` 를 `.env` 에서 넘긴다(값은 비워 둠, 기본 동작 그대로). 로컬 mock 검증용
- `infra/k8s/services/ai/ai.yaml` — **`EMBED_WORKER_ENABLED: "false"` 한 줄만** 더한다(켜는 것은 인프라가 덤프 뒤 바꿈). 자원 · 프로브 · 모델 경로는 그대로
- `ai/tests/test_worker.py` — 기존 EXTRACT 테스트는 내용을 고치지 않고 통과. 틀 이름 바뀜에 따른 import 만 맞춘다. EMBED 봉투에 EXTRACT `PROMPT_VERSION` 이 섞이지 않는 회귀 테스트 추가
- `ai/tests/test_embed.py`(새) — 먼저 실패하는 테스트로 (모든 경우 실제 모델 없이 제어 가능한 가짜 인코더)
  - 입력: 빈 제목 · 앞뒤 공백 · CRLF 그대로, 본문 799 · 800 · 801자, 이모지가 800자 경계에 걸림, None · 숫자 제목/본문
  - 결과: ndarray → JSON 숫자 목록, NaN · Inf · float4 초과 · 차원 다름 · 길이 1 아님 → `INTERNAL`
  - 메시지: `jobs.EMBED` 없음 → 건너뛰고 ack, EXTRACT · EMBED 둘 다 실린 메시지에서 그룹별로 따로 ack, 깨진 payload → ack
  - W1: 204 · 400 · 404 · 409 ack, 401 · 403 BLOCKED · 미ack, 5xx 다시 보내는 동안 **다시 인코딩하지 않음**, 끝내 실패 → 미ack 뒤 다시 가져가기
  - 시간: 시간 초과 뒤 계산이 남아 있으면 다음 인코딩을 시작하지 않고 EMBED BLOCKED
  - 수명: 모델 읽기 실패 → EMBED 만 BLOCKED · EXTRACT 계속, 한 워커의 예외가 다른 워커를 멈추지 않음, 두 워커 함께 종료가 공통 예산 안
- `ai/tests/test_health.py` — `embed_worker` 칸, OFF/RUNNING/BLOCKED 에 따른 상태 코드
- `SSOT.md` 3절 — 임베딩 입력 표기 「본문 앞 800자」 → 「제목 + 줄바꿈 + 본문 앞 800자」(덤프 · 실험 코드와 같게, 장민준 11/09)

## 작업 순서

- [x] 1. 틀 나누기 — `QueueWorker` + EXTRACT 옮기기. 기존 `pytest` 무수정 통과 + EXTRACT 봉투 회귀 테스트
- [x] 2. EMBED 처리 — `test_embed.py` 먼저(실패 확인) → `app/embed/` 구현 → 통과
- [ ] 3. 띄우기 · 헬스 · 설정(코드 · 테스트 끝, 로컬 compose mock 확인 남음) — `main.py` · `config.py` · `compose.yaml` · `ai.yaml`(꺼짐 한 줄). `test_health.py` 통과, 로컬 compose mock 으로 B1 → EXTRACT · EMBED `SUCCEEDED` → MATCH_EVENT 작업 생성(판정 워커가 없어 `QUEUED` 로 남음)까지
- [ ] 4. 실제 모델 대조 — 견본 덤프가 오면: 덤프를 만든 모델 판(snapshot) · sentence-transformers · torch 판을 장민준에게 확인, 같은 기사 3건의 입력 글 해시가 같은지 먼저 본 뒤 CPU 벡터가 1024 · 유한 · 길이 1 · 덤프 저장 벡터와 코사인 0.999 이상(제안 기준). 2스레드에서 처음 읽기 시간 · 기사당 시간 · EXTRACT 와 함께 돌 때 최대 메모리 기록
- [x] 5. `SSOT.md` 3절 표기 고치기

## 안 바꿀 것

- EXTRACT 프롬프트 · 전처리 · 결과 모양(`ai/app/extract/`) — 발표까지 v4.14 고정
- MATCH_EVENT · ISSUE 처리(S15P31A102-186)
- backend · API 계약(`docs/api-internal.md`) · 큐 이름 · 그룹
- `ai.yaml` 의 자원 · 프로브 · grace · preStop — 4번 실측이 상한을 넘을 때만 인프라와 따로 맞춘다
- 운영에서 EMBED 켜기 · 수집 배치 · B1 켜기 — 인프라 몫(아래 「되돌리는 법」 앞의 켜는 조건)

## 리스크

- **asyncio 취소는 CPU 스레드를 멈추지 못한다** — 인코딩을 한 번에 하나로 제한하고 남은 계산을 추적한다. 시간 초과 뒤에도 계산이 남으면 그 작업은 `INTERNAL` 로 끝내고 EMBED 를 BLOCKED 로 둔다(재시작으로 복구). 기사 하나가 수 초라 정상 흐름에서는 나오지 않는다. 강제 종료까지 필요해지면 별도 프로세스 설계로 다시 계획한다
- **덤프와 기준 어긋남** — 덤프 인코더는 판(revision)을 코드로 고정하지 않았다(`issue_grouping.py` `bge_encoder`). 판이 다르면 같은 입력도 벡터가 다르다. 4번에서 판 · 입력 해시를 먼저 확인하고, 다르면 켜기 전에 장민준과 맞춘다
- **메모리 · CPU** — SSOT 10절 3.1GB · 4.3초는 제목 없는 입력 · GPU 서버 2코어 조건이다. 제목 추가 · 처음 읽기 순간 · EXTRACT 동시 처리 · 롤링 배포(`maxSurge: 1`)로 모델을 읽은 Pod 가 잠시 둘인 순간은 따로 재야 한다. CPU 500m 은 요청이고 상한이 없다. 4번 숫자가 상한 5Gi 에 가까우면 켜기 전에 인프라와 맞춘다
- **옛 EMBED 메시지** — 11/02 시험 등으로 `embed` 그룹에 안 읽은 · ack 안 된 메시지가 남아 있을 수 있다. 켜는 순간 그것을 처리해 MATCH_EVENT 작업이 생기면 덤프 적재의 「운영 분석 표가 비어 있음」(`infra/server/data-load.md`)과 부딪힌다 — 그래서 꺼진 채 배포한다
- **틀 일반화로 EXTRACT 가 깨짐** — 1번을 따로 커밋하고 기존 테스트가 무수정 통과해야 다음으로 간다
- **헬스 503 의 영향** — 켜진 EMBED 장애가 readiness 를 내려 Service 엔드포인트에서 빠진다. ai 는 외부 요청을 받지 않아 서비스 영향은 없고 경보로 알리는 효과만 있다

## 어떻게 검증하나

- `uv run --locked ruff format --check .` · `ruff check .` · `pytest` 통과(`.claude/stack.md` §3)
- `test_embed.py` · `test_health.py` 의 위 경로 통과, 기존 EXTRACT 테스트 무수정 통과
- 로컬 compose(mock, `EMBED_WORKER_ENABLED=true`): B1 → EXTRACT · EMBED `SUCCEEDED`, `article_embedding` 행, MATCH_EVENT 작업 생성. `EMBED_WORKER_ENABLED=false` 면 EMBED 가 `QUEUED` 로 남고 `/health` 200
- 실제 모델(4번): 판 · 입력 해시 일치 확인 뒤 덤프 벡터와 코사인 0.999 이상(3건), 처음 읽기 · 기사당 시간 · 최대 메모리 숫자

**켜는 조건(인프라와 같이, 이 MR 범위 밖)**: 덤프 적재 확인 → `embed` 그룹의 lag · PEL 과 DB 의 EMBED 작업 상태 대조 → 옛 메시지 정리 → `EMBED_WORKER_ENABLED=true` → 첫 몇 건 `article_embedding` · `/health` 확인

## 되돌리는 법

- 먼저 `EMBED_WORKER_ENABLED=false` 로 소비를 끈다(EXTRACT 는 그대로). 필요하면 `ai` 배포 태그를 이전 이미지(5a950746)로 되돌린다(인프라)
- 이미 저장된 `article_embedding` 과 그 뒤 만들어진 MATCH_EVENT 작업은 자동으로 돌아가지 않는다. 켠 시각 · 영향 기사 · 작업 ID · 모델 판을 로그로 남기고, 잘못 저장된 벡터는 backend 담당과 정한 절차로 다시 임베딩한다
- 이 MR 은 큐 · DB 모양을 바꾸지 않는다. 꺼진 채 배포하므로 Revert 만으로 지금 상태(EXTRACT 만)로 돌아간다
