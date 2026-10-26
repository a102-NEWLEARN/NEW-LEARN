# Jira 30 — 분석 작업 큐 · W1 결과 받기 · 실패 처리 · 내부 API 출입증

## 무엇을 / 왜

AI 분석이 돌려면 API 가 작업을 큐(Redis Streams)에 넣고, 워커가 결과를 W1(`POST /internal/v1/analysis-jobs/{jobId}/result`)로 돌려줘야 한다. 지금은 셋 다 없다. 큐, W1, 결과 받기, 실패 다시 걸기가 없고, 직원용 문(`/internal/v1`)은 로그인 규칙에 걸려 워커가 부르면 무조건 401 이다. 34(B1 투입) · 56(마인드맵 저장) · 35(임베딩 · 사건) · 40(이슈)이 모두 이 틀 위에 선다. 계약(스트림 · 그룹 · 봉투 · 상태)은 `docs/api-internal.md` 3 ~ 6절에 이미 있고, 숫자와 출입 방법만 이 티켓에서 정한다.

## 정한 것

| 항목 | 정한 것 |
|---|---|
| 직원용 문 출입 (2026-10-26 사용자 선택) | **출입증 두 장** — 워커 키는 W1(`/internal/v1/analysis-jobs/**`)만, 배치 키는 B1(`/internal/v1/articles/**`)만 통과한다. 헤더 `X-Internal-Key`. 키가 없거나 틀리면 401 `UNAUTHORIZED`, 다른 문의 키면 403 `FORBIDDEN`. `/internal/**` 은 세션 · CSRF 없는 보안 체인을 따로 탄다. 키를 설정하지 않으면 모두 막는다. 비교는 `MessageDigest.isEqual`(걸린 시간으로 키를 못 맞히게), 키는 로그에 남기지 않는다 |
| 최대 시도 수 (제안) | 3번(첫 시도 포함) |
| 다시 걸기 간격 (제안) | `LLM_TIMEOUT` 1분 → 5분 · `LLM_RATE_LIMITED` · `LLM_UNAVAILABLE` 5분 → 15분 · `LLM_OUTPUT_INVALID` · `INTERNAL` 1분 뒤 한 번만 · `RESULT_SCHEMA_INVALID` 바로 한 번만 · `LLM_INPUT_TOO_LONG` · `LLM_REFUSED` · `INPUT_NOT_ANALYZABLE` 안 함 (`api.md` 2절 표의 「다시 걸까」를 그대로 따르고 간격만 더함) |
| 큐에 못 넣은 작업 | 「오래 QUEUED」를 「큐에 넣었다는 표시가 1분 넘게 없음」으로 정한다. 작업 행에 `published_at` 을 두고, 커밋 뒤 넣기에 성공하면 적는다. 스케줄러가 1분마다 `QUEUED` 인데 `published_at` 이 빈 지 1분 넘은 작업을 다시 넣는다. 워커가 느리거나 꺼져 있을 때 같은 메시지를 또 넣지 않아 GMS 를 두 번 부르지 않는다 |
| 스트림 길이 상한 N (제안) | 스트림마다 `ACKED MAXLEN ~ 10000`. 본문 10KB 로 잡아도 약 100MB 라 Redis `maxmemory 1gb`(로그인 세션 · 잠금 키와 같이 씀) 안. 실제 본문 크기는 NewsData 구독 뒤 재서 고친다 |
| 스트림 · 그룹 만들기 | API 가 뜰 때 `XGROUP CREATE <스트림> <그룹> 0 MKSTREAM` 으로 4개를 만든다(이미 있으면 그대로). 워커가 먼저 떠도 메시지를 놓치지 않게 시작 위치는 0 |
| 워커 쪽 숫자 (BE 안, AI 확인) | W1 이 5xx · 연결 실패면 2 · 4 · 8 · 16 · 32초 간격으로 5번 더 보낸다(약 1분). 처리 중에 죽은 워커의 메시지는 10분 넘게 ack 가 없으면 다른 워커가 `XAUTOCLAIM` 으로 가져간다(다시 보내는 총 시간보다 길게). `api.md` 4절 AI 질문에 올린다 |
| `NO_EVENT` 화면 상태 | 56 으로 넘긴다 — `article_mindmap.primary_core_index` 칸이 56(`EXTRACT` 저장)에서 생긴다. 이 티켓은 `NOT_ANALYZABLE` 만 |

## 바꿀 파일

MR A — 직원용 문 출입증 (인증 코드라 사람이 최종 확인)
- `backend/.../common/security/InternalApiSecurityConfig.java`(새) — `@Order(1)` 체인, `securityMatcher("/internal/**")`, STATELESS · CSRF 끔 · 요청 캐시 끔, 오류는 `SecurityErrorHandler` 그대로
- `backend/.../common/security/InternalKeyFilter.java`(새) — 헤더를 두 키와 비교해 역할 `WORKER` · `BATCH` 인증을 만든다
- `backend/src/main/resources/application.yaml` — `newlearn.internal.worker-key: ${INTERNAL_WORKER_KEY:}` · `batch-key: ${INTERNAL_BATCH_KEY:}`
- `backend/.../SecurityRulesTest.java` — 키 없음 · 틀린 키 401, 배치 키로 W1 403, 워커 키로 B1 403, 맞는 키는 컨트롤러까지 감(아직 없는 주소는 404), 손님용 문 규칙 그대로. 기존 `internalApisStayLocked` 는 이 시험들로 바꾼다
- `SSOT.md` 8절 「API 인증」 행에서 내부 API 를 빼고 9절에 결정 한 줄 · `docs/api.md` 1절 인증 · `docs/backend-convention.md` 5절(내부 API 시험에서 키 붙이는 법)

MR B — 큐 · W1 · 실패 처리
- 마이그레이션 `V번호__analysis_job_queue.sql`(새, 번호는 그때 dev 의 가장 큰 번호 다음) — `analysis_job` 에 `result jsonb`(판정 기록, 35 · 40 이 씀) · `queued_at timestamptz not null default now()` · `published_at timestamptz`
- `analysis/AnalysisJob.java` — 칸 셋, 이름 있는 메서드 `markPublished` · `succeed` · `fail` · `requeue`(attempt + 1)
- `analysis/AnalysisJobRepository.java` — 행 잠금 조회(W1), 스케줄러용 조회, 조건부 갱신(`where status = ? and attempt = ?` — 배포 중 Pod 둘이 겹쳐 돌아도 한 번만)
- `analysis/queue/AnalysisStreams.java`(새) — 스트림 · 그룹 이름 한 곳(SSOT 4절 「큐 코드는 한 곳에」)
- `analysis/queue/JobPublisher.java`(새) — `XADD … ACKED MAXLEN ~ N * payload <json>` 을 Lua 스크립트로(`auth/LoginAttemptGuard.java` 와 같은 `StringRedisTemplate` + `RedisScript` 방식. Spring Data Redis 가 `ACKED` 를 받으면 그쪽으로)
- `analysis/queue/StreamGroupsInitializer.java`(새) — 뜰 때 그룹 4개
- `analysis/queue/JobQueuedEvent` · `JobQueuedListener`(새) — `@TransactionalEventListener(AFTER_COMMIT)` 로 발행하고 `published_at` 적기
- `analysis/AnalysisJobService.java`(새) — `queueRelease(article, stages)`(EXTRACT · EMBED 행 + `analysis.released` 메시지 — 34 가 부른다), `receiveResult(jobId, request)`
- `analysis/AnalysisResultHandler.java`(새 인터페이스) — 단계별 저장. 56 · 35 · 40 이 구현한다. 이 티켓에서는 시험용 구현만
- `analysis/AnalysisJobInternalController.java` · `analysis/dto/JobResultRequest.java`(새) — W1. 봉투 검사(성공인데 `result` 없음 · 실패인데 `error` 없음 → 400)
- `analysis/RetryPolicy.java` · `analysis/AnalysisJobScheduler.java`(새) — 코드 → 간격 표, 1분마다 다시 걸기 · 못 넣은 작업 넣기. `@EnableScheduling`. 시험에서는 끄고 메서드에 시각을 넘겨 부른다
- `article/dto/ArticleAnalysisStatus.java` · `article/ArticleSummaryAssembler.java` — `NOT_ANALYZABLE`(결과 없음 + `EXTRACT` 가 `INPUT_NOT_ANALYZABLE` 로 실패)
- 시험: `analysis/` 아래 통합 시험(Testcontainers Postgres · Redis 8.10.2 — `TestcontainersConfiguration`)
- 문서: `docs/api-internal.md` 3 · 4 · 5절(숫자 · 그룹 만들기 · `published_at`), `docs/api.md` 2절 표에 간격 칸 · 4절 AI 질문, `docs/data-model.md`(칸 셋), 새 스펙 `docs/specs/F03-F07-analysis-job-queue.md`(AC), 승인한 계획 사본 `docs/plans/2026-10-26-analysis-job-queue.md`

MR C — Infra (출입증 넣을 자리)
- `infra/server/seal-secrets.sh` — `internal-api`: 키 둘을 무작위로 만들어(묻지 않음) `app` 에 둘, `ai` 에 워커 키만 봉인
- `infra/k8s/services/app/backend.yaml` — `INTERNAL_WORKER_KEY` · `INTERNAL_BATCH_KEY`(secretKeyRef `optional: true` — 봉인 전에는 비어 모두 막힘)
- `infra/k8s/services/ai/ai.yaml` — `INTERNAL_API_KEY` · `BACKEND_URL`(AI 코드가 읽을 이름. `api-internal.md` 에 적음)
- `infra/server/README.md` 「봉인한 Secret 만들기」 한 줄

## 작업 순서

- [x] Jira 30 진행 중, 브랜치 `feat/backend/S15P31A102-30-internal-key` ← `origin/backend`
- [x] A1 출입증 체인 · 필터 · 설정 + 시험 — 보안 시험 13개 통과, 되돌림 확인(빈 키 막기를 없애면 「401 이어야 하는데 404」, 키 검사를 끄면 12개 중 2개 실패), 로컬로 띄워 `curl` 로 401 · 403 · 404 와 쿠키 없음 확인
- [x] A2 문서(SSOT 8절 · api.md 1절 · 코드 약속 5절) → reviewer → MR A(!197) → backend — 🧑 사람 최종 확인 · 머지 남음
- [x] B1 마이그레이션 · 엔티티 메서드 · 리포지토리 — 브랜치 `feat/backend/S15P31A102-30-job-queue`(MR A 위)
- [x] B2 발행 · 그룹 만들기 · 커밋 뒤 발행 · `queueRelease` — 실제 Redis 시험(`ACKED` 자르기 포함)
- [x] B3 W1 · 봉투 검사 · 상태 바꾸기 · 처리기 넘기기
- [x] B4 다시 걸기 정책 · 스케줄러
- [x] B5 `NOT_ANALYZABLE` — B1 ~ B5 확인: 새 시험 42개, 되돌림 확인 8곳 모두 단언에서 실패, 로컬로 띄워 W1 204 · 409 · 404 와 스케줄러가 1분 안에 시도 2 로 다시 걸어 큐에 넣는 것까지 봄
- [ ] B6 문서 · 스펙 · 계획 사본 → reviewer → MR B → backend
- [ ] C seal-secrets · 매니페스트 → MR C → infra
- [ ] backend · infra → dev, 브랜치 맞추기, 태그 MR, 사이트 확인
- [ ] 🧑 사용자 — EC2 에서 `seal-secrets.sh internal-api`(GMS 봉인과 같이 해도 된다) → 봉인 파일을 가져와 MR
- [ ] Jira 30 완료, 34 · 35 · 40 · 56 설명에 쓰는 법 한 줄, zoo_docs learn(파일 하나씩 코드 캡처)

## 안 바꿀 것

- 단계별 결과 저장(56 · 35 · 40), B1 투입 주소(34), `MATCH_EVENT` · `ISSUE` 메시지 만들기와 한 번에 하나씩 돌리기(35 · 40)
- AI 워커 코드(스트림 읽기 · W1 부르기 · 다시 보내기 — AI 팀), GMS 키 · `LLM_MODE`(115)
- 손님용 문 보안 규칙(`SecurityConfig` 의 기존 체인), Envoy 길(`/internal` 은 계속 밖에 안 엶)
- 이미 적용된 마이그레이션 V1 · V2

## 리스크

- **보안 체인 순서를 잘못 두면 손님용 문이 열리거나 닫힌다** → 체인 둘 다 `SecurityRulesTest` 로 본다(기존 시험 그대로 통과 + 새 시험). 인증 코드라 사람이 최종 확인한다
- **배포 중 Pod 둘이 스케줄러를 같이 돌린다**(maxSurge 1) → 다시 걸기 · 넣기를 조건부 갱신으로 해 한 번만 된다. 시험으로 두 번 불러 본다
- **결과 저장 실패를 어떻게 남기나** — 처리기가 `RESULT_SCHEMA_INVALID` 를 던지면 처리기가 쓴 것은 되돌리고 작업은 `FAILED` 로 남겨야 한다 → 처리기 저장과 실패 기록을 다른 트랜잭션으로 나눈다(`TransactionTemplate`)
- **Redis 메모리** — 본문이 큰 기사가 많으면 N 을 줄인다. 실제 크기는 구독 뒤 잰다
- **마이그레이션 번호가 113 · 63 · 64 와 겹칠 수 있다** → 머지 직전 dev 의 번호를 보고 나중에 머지하는 쪽이 올린다(`data-model.md` 규칙)
- **키를 봉인하기 전에는 W1 · B1 이 모두 401** — 의도한 동작(닫힌 채로 시작). 지금은 워커 코드도 없어 영향 없음

## 어떻게 검증하나

- 시험(실제 Postgres · Redis)
  - 출입증: 키 없음 · 틀린 키 401, 남의 문 키 403, 맞는 키 통과, 키 설정이 비면 맞는 키도 401, 응답 헤더에 세션 쿠키 · XSRF-TOKEN 이 안 붙음
  - 발행: 작업 행을 저장한 트랜잭션이 커밋돼야 메시지가 들어가고 롤백하면 안 들어감, `published_at` 이 적힘, 한 그룹만 ack 한 메시지는 안 잘리고 둘 다 ack 하면 잘림(시험에서 N 을 작게), 뜰 때 그룹 4개
  - W1: 없는 작업 404, `attempt` 다르면 409, 끝난 작업 409, 같은 결과 두 번이면 두 번째 409, 성공 저장(처리기 호출), 실패 저장(`error_code` · `error_message`), 봉투가 틀리면 400, `RESULT_SCHEMA_INVALID` 면 `FAILED` 를 남기고 바로 attempt 2 로 다시 걸고, 또 그러면 멈춤
  - 다시 걸기: 코드별 간격 전에는 안 걸고 지나면 attempt + 1, 최대 시도 수에서 멈춤, 다시 안 거는 코드는 그대로, 넣지 못한 작업은 1분 뒤 다시 넣고 넣은 작업은 다시 안 넣음, 두 번 불러도 한 번만
  - 화면 상태: `NOT_ANALYZABLE` 계산(첫 분석만), 기존 기사 API 시험 그대로
- 되돌림 확인(`/verify` 1-2단계) — 새 시험이 지키는 구현을 되돌리면 단언에서 빨개지는지
- 실제 실행: 로컬(`.claude/stack.md` 3절 backend 실행)에서 뜰 때 `XINFO GROUPS analysis.released` 에 그룹 둘, `curl` 로 W1 키 없음 401 · 배치 키 403 · 워커 키 + 없는 작업 404. 기사 · 작업 행을 SQL 로 넣고 `FAILED`(`LLM_TIMEOUT`)를 보내 204 → 간격을 짧게 한 설정으로 attempt 2 · 스트림에 메시지(`XRANGE`)
- 사이트(반영 뒤): `https://newlearn.io.kr/internal/v1/...` 는 계속 밖에서 안 열림(404), 서버 Redis 에 그룹 4개(읽기만), health UP, 기존 화면 API 응답 그대로
- reviewer 조수: 보안 체인 · 키 비교 · 트랜잭션 경계 · 계약 문서와 어긋남

## 계획 뒤 바뀐 것

- `SSOT.md` 9절은 「뒤집은 것」 절이라 결정을 거기 적지 않았다. 출입증 결정은 8절 「API 인증」 행 안 「정한 것」으로 옮겨 적었다
- 승인한 계획 사본(이 파일)은 MR B 가 아니라 MR A 에 같이 넣었다 — 팀원 · reviewer 가 먼저 볼 수 있게
- 직원용 문의 401 · 403 설명 문구를 손님용 문과 다르게 했다(`SecurityErrorHandler.forInternalApi` — 「출입증(X-Internal-Key)이 없거나 맞지 않는다」 · 「이 출입증으로는 열 수 없는 주소다」). 워커가 「로그인이 필요한 주소다」를 받으면 헷갈려서다. 코드는 그대로 `UNAUTHORIZED` · `FORBIDDEN`
- `.env.example` 에 `INTERNAL_WORKER_KEY` · `INTERNAL_BATCH_KEY` 빈 칸을 더했다(로컬에서 W1 · B1 을 불러 볼 때)
- reviewer 조수(2026-10-26) 뒤 더한 것: 두 키가 같으면 API 가 뜨지 않게, 설정한 키의 앞뒤 공백 · 줄바꿈을 떼게, 인증을 요청 속성에도 두게(비동기 응답 대비) 했다. 키를 비운 시험은 로컬 `.env` 와 상관없게 값을 못 박았다. `compose.yaml` 의 backend 에 출입증 env 두 줄, F12 스펙 AC-10(「내부 API 는 잠긴 채」 → 「손님 · 로그인 세션으로는 안 열림」)을 고쳤다

- MR B 를 하며 바뀐 것
  - 발행은 Lua 대신 Spring Data Redis 4.1.1 의 `XAddOptions.trim(TrimOptions.maxLen(N).approximate().deletionPolicy(removeAcknowledged()))` — 이 판이 `ACKED` 를 받는다(jar 에서 확인). 그룹 만들기는 `xGroupCreate(…, mkStream=true)` 에 BUSYGROUP 만 넘긴다
  - 단계별 메시지는 `AnalysisMessageFactory`(EXTRACT · EMBED 는 이 티켓, MATCH_EVENT · ISSUE 는 35 · 40), 처리기는 `AnalysisResultHandlers` 묶음으로 찾는다 — 시험이 묶음을 가짜로 바꿔 끼워 56 · 35 · 40 이 처리기를 더해도 깨지지 않게
  - 스케줄러가 못 넣은 작업을 넣을 때는 `published_at` 을 먼저 적고(차지) 넣는다. 넣다 실패하면 지운다. 차지한 뒤 넣기 전에 Pod 가 죽으면 그 작업은 `QUEUED` 로 남는다 — 드물어 손으로 다시 건다(한계)
  - 봉투를 JSON 으로 못 읽으면 W1 컨트롤러가 400 `RESULT_SCHEMA_INVALID` 로 답한다(전역 처리기는 `VALIDATION_FAILED` 를 줘서)
  - 시험은 `src/test/resources/config/application.yaml` 로 스케줄러를 끈다

## 되돌리는 법

- MR 을 Revert(backend → dev). 코드는 바로 돌아간다
- 🔴 마이그레이션은 되돌리지 않는다 — 칸 셋은 남는다(비어 있어도 해가 없음). 지우려면 새 마이그레이션
- Redis 의 스트림 · 그룹은 남는다 — 필요하면 `DEL analysis.released analysis.match_event analysis.issue`
- 봉인 Secret 은 매니페스트에서 빼면 Argo CD 가 지운다
