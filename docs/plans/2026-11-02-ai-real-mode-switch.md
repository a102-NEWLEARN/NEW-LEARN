# AI 워커 실제 모드 켜기 — Jira S15P31A102-115 MR 2 (이번엔 EXTRACT 까지)

## 무엇을 / 왜

ai 워커를 가짜 응답(`LLM_MODE=mock`)에서 SSAFY GMS 호출(`gms`)로 바꿔, EXTRACT(F03 기사 핵심 정보 구조화 · F04 기사 마인드맵 생성) 작업 큐를 실제로 처리하게 한다. AI 팀의 EXTRACT 워커(!510)가 dev 에 들어와 배포됐고(!511, ai `638adb57`) AI 팀장이 켜자고 했다. 모델 자리 · 자원 계산 · 키 봉인 같은 배경은 승인한 계획 `docs/plans/2026-10-26-ai-real-mode-infra.md` 에 있고, 이 계획은 그 C 절(MR 2)을 구체화한다.

API 이름: B1 기사 투입(`POST /internal/v1/articles/{articleId}/release`) · W1 분석 결과 전달(`POST /internal/v1/analysis-jobs/{jobId}/result`) — `docs/api-internal.md` 2 · 5절. A7 최신 기사 · A8 기사 상세(`GET /api/v1/articles/{articleId}`) · A9 기사 마인드맵(`GET /api/v1/articles/{articleId}/mindmap`) — `docs/api-screen.md`.

## 지금 상태 (2026-11-02 16:30 KST, 읽기만 해서 확인)

- 키: Secret `ai/gms-api`(`GMS_API_KEY`)로 GMS 에 빈 메시지 요청 → 400(키 통과 · 답 안 만듦). 워커 키 넷(`ai/internal-api` · `app/internal-api` Secret, ai · backend Pod env)이 같은 값(길이 · 해시로만 비교)
- 길: ai Pod 에서 W1 워커 키 → 400(출입 통과 · 빈 본문 거절), B1 배치 키 → 404(없는 기사), GMS 키 없이 → 401
- 대기 작업: `analysis_job` 0, `analysis.released` 길이 0 · 그룹 `extract` · `embed` 소비자 0 · 미ACK 0
- 시험 기사 셋(AI 팀장 제공 NewsData 보관 원본, 인프라 담당이 16:27 SQL 로 적재): `article` 1 삼성SDI(정상 · 대표 사건 있음) · 2 무신사(대표 사건 없음) · 3 MBN(본문 빈 문자열 — 워커의 거르기 시험). `released_at` 비어 있음. 언론사 코드 `newsis` 는 문서 값, `yonhapnewstv` · `mbn` 은 NewsData `source_id` 를 몰라 지은 임시 값(`docs/data-model.md` 5절 15번), 카테고리는 대응 행이 없어 비움(5절 7번)
- 자원: 워커 노드 메모리 요청 6,812Mi(43%). 롤링 중 ai 둘이면 70%, 굽기 잡 둘까지 83%. ai 실제 사용 58Mi(EXTRACT 는 임베딩 모델을 안 읽는다)

## 바꿀 파일

- `infra/k8s/services/ai/ai.yaml` — `LLM_MODE` `mock` → `gms`. `GMS_API_KEY` 를 `secretKeyRef` `gms-api` / `GMS_API_KEY` 로 더한다(optional 아님 — Secret 이 없으면 새 Pod 가 안 뜨고 옛 Pod 가 남는다). 머리 주석 · GMS 주석 · `BACKEND_URL` · `INTERNAL_API_KEY` 의 「AI 코드가 아직 안 읽는다, 자리만」 주석을 지금 상태로. **이 파일만 따로 한 커밋** — 되돌릴 때 이 커밋만 되돌린다
- `infra/k8s/services/ai/kustomization.yaml` — 봉인 파일 줄 주석만(「실제 모드로 바꿀 때」 → 지금 씀)
- `infra/k8s/services/app/netpol.yaml` — 머리 주석 「2026-10-27 워커 코드는 아직 안 보낸다, 자리만」을 지금 상태로(주석만, 정책 그대로)
- `infra/server/ai-worker.md` — 「실제 모드 켜기 · 끄기」 절: 켜졌는지 보는 법, B1 거는 법, 되돌리기, 키를 바꾸면 다시 띄우기, 내릴 때 처리 중이던 작업
- `docs/plans/2026-10-26-ai-real-mode-infra.md` — C 절 체크칸 · 이 계획을 가리키는 한 줄, 「계획 뒤 바뀐 것」에 넷(EXTRACT 만 · 남은 질문 3 · 6 의 답 · 같이 켜지 않음)
- `docs/plans/2026-11-02-ai-real-mode-switch.md` — 이 계획(새)

B1 은 ai Pod 안에서 부른다 — ai → backend 는 W1 때문에 이미 열린 길이고(`app/netpol.yaml`), 배치 키는 서버 안에서 표준 입력으로 Pod 에 넘겨 화면 · 명령 기록에 안 남긴다. `app/netpol.yaml` 이 권하는 `port-forward` 는 새 시험 Pod 를 만들지 말라는 뜻이라 이것과 부딪치지 않는다. 오늘 점검 때 같은 방법으로 B1 404 를 확인했다.

## 작업 순서

- [x] MR(작업 브랜치 → infra) — 위 파일, 커밋 둘(문서 · 주석 / `ai.yaml`). 확인: 파이프라인 success, 서버에 폴더를 보내(`scp -r infra/k8s/services/ai newlearn:/tmp/ai-115`) `kubectl diff -k /tmp/ai-115` 에서 바뀌는 것이 ai Deployment 의 env 둘뿐 — !519, 파이프라인 #260496, `kubectl diff -n ai -k` 는 env 둘(나머지는 손으로 diff 할 때만 보이는 Argo CD 추적 표시), 2026-11-02 16:54 infra 머지
- [x] infra → dev MR(소스 브랜치 지우기 끔) — 머지 직전 원격 dev SHA · 열린 MR 을 같은 스크립트에서 API 로 읽고, 파이프라인 success 뒤 머지. 머지는 인프라 담당 지시로 Claude 가 MR 화면에서 한다(2026-11-02) — 자동 권한 검사가 막으면 우회하지 않고 인프라 담당이 누른다. 확인: 아래 검증 2 — !520, 파이프라인 #260520, 16:57:27 dev 머지(89f286a5). 머지 3초 뒤 새 Pod, 8초 뒤 Ready · 재시작 0, `/health` gms · RUNNING, 소비자 1, 교체 동안 사이트 health 274번 실패 0
- [x] B1 기사 1 → 확인(검증 3) → 기사 2 · 3 → 확인(검증 4 · 5) → AI 팀장에게 기사 ID · EXTRACT jobId · 완료 로그 · DB 결과를 넘김. **이 계획의 승인이 B1 셋(GMS 크레딧 사용 · 기사 1 · 2 공개)까지 덮는다** — 기사 1(job 1) · 2(job 3) `SUCCEEDED` · `gpt-6-luna` · `extract-v4.12-mindmap` · 공개, 대표 번호 0 · null(기대와 같음), 기사 3(job 5) `INPUT_NOT_ANALYZABLE` · `calls=0` · 미공개 · A8 · A9 404, extract 미ACK 0, EMBED 셋 `QUEUED`(lag 3). 결과는 Jira 115 댓글. AI 팀장이 A8 · A9 로 세 경로를 확인함(기사 2 마인드맵의 원문에 없는 표현은 AI 팀이 다음 프롬프트 판 사례로)
- [x] 켠 뒤 관찰(검증 8) — 07:50 ~ 08:30 UTC 40분 창(켠 순간 · 기사 처리 포함): ai 메모리 최대 61MiB · CPU 최대 0.04코어, 워커 노드 steal 최대 0.12코어 · 평균 0.08코어, ai 재시작 0. Prometheus 15초 · 1분 표본이라 짧은 순간 최대는 놓쳤을 수 있다
- [ ] 기록 — Jira 115 댓글 · 완료 기준 4 고침(인프라 담당 승인 뒤), `SSOT.md` 6절(ai 키 · 모드) · 10절(잰 값)은 Jira 151 문서 MR 이 머지된 뒤 따로

## 안 바꿀 것

- `ai/` 코드 · 이미지 태그(`638adb57`) · replicas 1 · 자원 · probe · 종료 시간(`terminationGracePeriodSeconds` 30 = preStop 10초 + 워커 종료 대기 20초) — 종료 대기 20초 그대로에 AI 팀장 동의(2026-11-02)
- 모델 경로 env — EXTRACT 는 임베딩 모델을 안 읽는다. EMBED 워커 때 정한다
- `SSOT.md` · `infra/README.md` · `.claude/stack.md` — Jira 151 문서 MR 이 고치는 중이라 겹치지 않게
- backend · DB 스키마 · Redis · Argo CD 설정 · 수집 배치(보류 그대로, `SSOT.md` 8절)
- 카테고리 대응 행 · 언론사 코드 규칙 — BE 몫(`docs/data-model.md` 5절 7 · 15번)

## 리스크

- **GMS 크레딧** — 켠 뒤 B1 을 건 기사마다 팀 공용 크레딧을 쓴다. 이번에 GMS 를 부르는 기사는 1 · 2 둘이다(3 은 부르기 전에 걸러진다). 보통 기사당 한 번 부르지만, 실패하면 BE 다시 걸기(시도 최대 3, `RetryPolicy`) × 출력 검사 다시 부르기(2번, `ai/app/extract/run.py`) × HTTP 다시 부르기(`ai/app/gms.py`)만큼 늘 수 있다. 어림: gpt-6-luna 는 추출 + 판정에 기사당 약 7.4 크레딧(`SSOT.md` 10절 2026-10-23) — 이번엔 추출만이라 그보다 적다. 남은 크레딧은 인프라에서 볼 수 없다(미확인)
- **키가 틀린 경우** — 켤 때 키가 비면 `BLOCKED` → `/health` 503 → 새 Pod 가 Ready 가 안 되고 옛 Pod(mock)가 남는다. 돌다가 GMS · W1 이 401 · 403 이면 `BLOCKED` → Pod NotReady → 3분 뒤 경보 `NewlearnServiceDown`(ai/ai). 그 메시지는 ack 없이 그 소비자 아래 남아, 키를 고쳐 다시 띄워도 마지막 전달 뒤 20분이 지나야 다른 소비자가 가져가고 그때 GMS 를 다시 부른다. 그동안 작업은 `QUEUED` 다. 오늘 키 넷 · GMS 를 미리 확인해 가능성은 낮다. GMS 크레딧이 떨어졌을 때 응답 코드는 미확인(401 · 403 이면 같은 모양)
- **배포와 겹친 작업** — preStop 10초 동안 옛 워커는 새 메시지를 계속 읽고, 종료 신호 뒤 20초 기다려도 못 끝내면 ack 없이 끊긴다. 마지막 전달 뒤 20분 넘게 ACK 가 없으면 다른 소비자가 가져가 GMS 를 한 번 더 부른다. 이번 교체 때는 처리 중인 작업이 없다(B1 은 켠 뒤에 건다)
- **EMBED 작업이 쌓인다** — B1 이 EMBED 작업도 만들지만 소비자가 없어 `embed` 그룹에 남고, 그래서 MATCH_EVENT(F06 동일 사건 기사 클러스터링)로 넘어가지 않는다. AI 팀장 확인: 이번엔 예상대로. EMBED 워커가 생기면 쌓인 것부터 읽는다. 그동안 기사 1 의 `eventMatchStatus` 는 `NONE`(EXTRACT · EMBED 를 기다리는 중)으로 남아 화면에 「사건을 찾는 중」류가 계속 보일 수 있다
- **시험 기사가 운영 화면에 보인다** — EXTRACT 결과를 저장하면 기사 1 · 2 가 공개된다(`released_at`). 기사 1 의 임시 언론사 코드 `yonhapnewstv` 가 A7 · A8 의 언론사 코드로 나간다 — BE 가 코드를 정하면 `article.press_code` 를 바꿔야 한다
- **같은 기사로 다시 시험할 수 없다** — B1 은 기사마다 한 번뿐이다(분석 작업이 있으면 409 `ALREADY_RELEASED`). 다시 시험하려면 새 기사를 넣거나 SQL 로 `analysis_job` · `article_mindmap` · `released_at` 을 지운다
- **노드 CPU** — 워커 노드는 Lightsail 버스트형이다. EXTRACT 는 대부분 GMS 응답을 기다리는 일이라 CPU 를 적게 쓸 것으로 본다(추정) — steal · 사이트 health 를 같이 본다

## 어떻게 검증하나

1. MR — 파이프라인 success, 서버 `kubectl diff -k /tmp/ai-115` 차이가 ai Deployment env 둘(`LLM_MODE` 값 · `GMS_API_KEY` 추가)
2. 반영 — Argo CD ai Synced · Healthy, 새 Pod Ready · 재시작 0, Pod 안 `/health` 200 에 `"llm_mode":"gms"` · `"worker":"RUNNING"`, Pod env 에 `GMS_API_KEY` 있음(값은 안 봄), `XINFO CONSUMERS analysis.released extract` 에 새 Pod 이름의 소비자. 교체 동안 관리자 PC 에서 1초마다 사이트 health(ai 는 사이트 길에 없다 — 같은 노드에 영향이 없는지 보는 것) → 실패 0
3. 기사 1 — B1 202 와 jobId 둘(EXTRACT · EMBED). `analysis_job` EXTRACT `SUCCEEDED` · `error_code` 없음, `article_mindmap` 한 행의 `model` = `gpt-6-luna` · `prompt_version` = `extract-v4.12-mindmap`(mock 이 아니라는 증거), `article.released_at` 채워짐, `XPENDING analysis.released extract` 0, ai 로그 `EXTRACT job=… SUCCEEDED calls=1 이상 tokens=[(…)] … W1=204`. `primary_core_index` 는 모델 출력이라 기대만 적는다(AI 팀 로컬 결과 0) — 판정은 AI 팀장
4. 기사 2 — `SUCCEEDED` · 같은 모델 · 판, `released_at` 채워짐. `primary_core_index` 기대 null(AI 팀 로컬 결과) — 판정은 AI 팀장
5. 기사 3 — `analysis_job` EXTRACT `FAILED` · `INPUT_NOT_ANALYZABLE`, 로그 `calls=0`(GMS 안 부름), `released_at` 비어 있음 → A8 · A9 가 404 `ARTICLE_NOT_FOUND`(공개 전 기사는 없는 기사로 본다 — `docs/api.md` 1절)
6. EMBED 쌓임 — `XINFO GROUPS analysis.released` 의 `embed` lag = B1 건수(3), `analysis_job` EMBED 셋이 `QUEUED`
7. AI 팀장이 A8 · A9 · W1 · 오류 로그를 본다 — 그쪽 몫
8. 켠 뒤 30분 — ai 메모리 working set 이 요청 4Gi 아래(EXTRACT 만이라 수백 MiB 안쪽 기대), 워커 노드 steal 이 옛 최대(약 0.32코어, 2026-10-26 계획) 근처를 넘지 않음, 사이트 health 실패 0

## 되돌리는 법

1. 설정 문제 · 결과가 이상함 → `ai.yaml` 커밋만 되돌리는 MR(`git revert <그 커밋>` — `LLM_MODE` 가 `mock` 으로, `GMS_API_KEY` 연결이 빠짐). 계획 · 운영 메모 커밋은 남긴다. 기본은 작업 브랜치 → infra → dev(파이프라인 둘, 몇 분). 급하면 dev 로 바로 보내되 예외 병합이라 팀에 먼저 알리고 MR 에 이유를 남긴 뒤(`docs/git-convention.md` 1절), 머지 뒤 infra 를 dev 에 맞춘다
   - 확인: 새 Pod(mock · OFF) `/health` `worker: OFF`, `XINFO CONSUMERS` 의 옛 소비자 idle 이 계속 늘어남. 옛 워커가 하던 작업이 없으면 「EXTRACT 워커 멈춤」 로그가 찍히고, 하던 작업이 20초 안에 안 끝나 취소되면 그 로그 없이 끝난다(끊긴 메시지는 `XPENDING` 에 남음). 옛 Pod 가 지워지면 `kubectl logs` 로 못 보니 교체 중에 `kubectl -n ai logs -f <옛 Pod>` 로 보거나 Grafana › Explore › Loki 에서 본다
   - 되돌린 뒤에도 BE 다시 걸기(`RetryPolicy` — LLM_TIMEOUT · UNAVAILABLE · RATE_LIMITED 는 3회차까지, OUTPUT_INVALID · INTERNAL · RESULT_SCHEMA_INVALID 는 2회차까지)가 실패한 작업을 계속 큐에 넣는다. 실제 모드를 다시 켜는 순간 그 메시지들이 처리돼 GMS 를 부른다
2. 코드 문제 → `kustomization.yaml` `newTag` 를 `638adb57` → `753bf472` 로 MR. 753bf472 에는 `ai/app/worker.py` 가 없어(확인함) gms 로 두어도 큐를 읽지 않는다. 주의: 그 뒤 ai 코드가 dev 에 다시 들어오면 CI 가 `deploy/ai` 태그 MR 을 연다 — `LLM_MODE=gms` 인 채로 그 MR 을 머지하면 워커가 다시 켜지니, 1번(mock)도 같이 하거나 그 MR 을 머지하지 않는다
3. MR 을 기다릴 수 없을 때(마지막 수단, 인프라 담당이 서버에서) → Argo CD 자동 동기화를 **루트 앱 → ai 앱** 순서로 끈 뒤 `kubectl -n ai scale deploy/ai --replicas=0`. 루트 앱도 selfHeal 이라(`infra/k8s/bootstrap/root-app.yaml`) ai 앱만 끄면 루트가 ai 앱 정의를 되돌려 자동 동기화가 다시 켜진다. 다시 켤 때는 1번 Revert 가 머지된 뒤 **ai 앱 → 루트 앱** 순서로
- 🔴 되돌릴 수 없는 것: 이미 쓴 GMS 크레딧, 저장된 마인드맵과 그로 공개된 기사(`released_at`), B1 을 건 기사(같은 기사로 다시 B1 불가 — 위 리스크). 시험 기사를 화면에서 내리거나 다시 시험하려면 따로 SQL(인프라 담당)

## 계획 전에 바뀐 것 (2026-11-02)

| 무엇 | 전 | 지금 | 까닭 |
|---|---|---|---|
| 켜는 방식 | 화면에서 같이 보며 켬(10-29 인프라 담당) | 인프라가 켜고 B1 까지 건 뒤 결과와 함께 AI 팀장에게 넘김. 머지도 Claude 가 화면에서 | 인프라 담당 「그냥 내가 할수있는일 하고 했습니다 넘겨주면돼」 · 「머지도 너가해」 |
| 범위 | EXTRACT · EMBED(Jira 115 완료 기준 4) | EXTRACT 만 | EMBED 워커가 아직 없다. 완료 기준 4 는 인프라 담당 승인 뒤 고친다 |
| 시험 기사 | BE 가 1건 넣음 | AI 팀장이 고른 셋을 인프라가 SQL 로 적재 | 운영 DB 에 기사 0건, 적재 길은 보류(`SSOT.md` 8절) — 인프라 담당이 임시 언론사 코드 그대로 넣음 |
| 내릴 때 대기(옛 계획 남은 질문 6) | 약 100초로 늘릴지 물음 | 30초 그대로 | AI 코드가 20초 기다린 뒤 끊고, AI 팀장이 그대로 두는 데 동의. 배포가 잦아지면 다시 맞춘다 |
| GMS 주소 · 모델(옛 계획 남은 질문 3) | 확인 필요 | 지금 값 그대로 | AI 팀장 「주소 · 모델은 지금 값 그대로」 |
