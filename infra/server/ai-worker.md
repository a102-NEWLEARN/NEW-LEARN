# ai 워커 — 임베딩 모델 캐시 · GMS 키 · 실제 모드 켜기 · 끄기

ai 워커(`infra/k8s/services/ai/`)가 실제 모드(SSAFY GMS 호출 + 임베딩 BGE-m3-ko)로 돌 때 인프라가 갖추는 두 가지다. 왜 이렇게 두는지(이미지에 굽지 않는 까닭 · 자원 값 계산)는 `docs/plans/2026-10-26-ai-real-mode-infra.md`.

## 임베딩 모델 캐시

init 컨테이너 `model` 이 PVC `ai-model-cache`(`model-cache.yaml`)에 판(커밋)마다 폴더를 두고 한 번 받는다. 약 2.3GB, 첫 Pod 만 1분 안팎 더 걸린다. 앱은 고정 이름 링크 `/models/BGE-m3-ko` 로 읽고 허깅페이스에서 받지 않는다(`HF_HUB_OFFLINE=1`).

- 확인
  - `kubectl -n ai logs deploy/ai -c model` — 「받음: … (N초)」 또는 「있음: …」
  - `kubectl -n ai exec deploy/ai -c ai -- sh -c 'ls -l /models; du -sh /models/BGE-m3-ko/'`
- 판 바꾸기: `ai.yaml` 의 `MODEL_REVISION` 을 바꾸는 MR. 새 폴더에 받은 뒤 링크를 바꿔 끼운다. 옛 Pod 는 이미 읽은 모델로 돈다
- 옛 판 지우기: 링크가 새 판을 가리키는지 본 뒤 `kubectl -n ai exec deploy/ai -c ai -- rm -rf /models/BGE-m3-ko-<옛 커밋>`
- PVC 를 지우면 PV 와 워커 폴더가 남는다(Retain). 새 PVC 는 처음부터 다시 받는다. 남은 것은 `kubectl delete pv <이름>` 과 워커의 `/var/lib/newlearn/local-path/pvc-…_ai_ai-model-cache` 로 지운다

## GMS 키

실제 모드로 바꿀 때 한 번 (관리자 PC 에서 — 값을 묻는다). 넣는 키는 팀 공용 GMS 키다 — SSAFY GMS 는 한 팀에 키를 하나만 준다(2026-10-27). 그래서 팀원 개발 환경과 같은 키이고, 키가 바뀌면 여기서 다시 봉인한다.

스크립트가 클러스터의 ai Deployment 에서 GMS 주소 · 모델(`GMS_BASE_URL` · `GMS_MODEL`)을 읽고, 그 키로 메시지가 빈 요청을 보내 GMS 를 지나는지 본 뒤 `ai` 에 봉인한다. 키가 맞으면 HTTP 400(모델 API 가 빈 메시지를 거절 — 답을 만들지 않음), 틀리면 401 이다. `GET /models` 는 GMS 가 키와 상관없이 500 을 줘서 쓰지 않는다. 그래서 두 env 가 든 `ai.yaml` 이 반영된 뒤에 돌린다.

```bash
ssh -t ubuntu@<EC2 탄력적 IP> "bash infra/server/seal-secrets.sh gms"
ssh ubuntu@<EC2 탄력적 IP> 'cat ~/sealed/sealed-gms-api.yaml' > infra/k8s/services/ai/sealed-gms-api.yaml
```

봉인 파일은 `kustomization.yaml` 에 넣어 Secret `gms-api` 를 만든다(2026-10-27 봉인 · 반영). 2026-11-02 부터 `ai.yaml` 이 `GMS_API_KEY`(`secretKeyRef` `gms-api` / `GMS_API_KEY`)로 읽는다. 키를 바꾸는 순서는 아래 「키를 바꿀 때」.

## 실제 모드 켜기 · 끄기

2026-11-02 부터 `ai.yaml` 이 `LLM_MODE=gms` 다(Jira S15P31A102-115, 계획 `docs/plans/2026-11-02-ai-real-mode-switch.md`). 지금 도는 것은 EXTRACT(마인드맵 추출)뿐이다. EMBED 작업은 소비자가 없어 `embed` 그룹에 쌓이고, EMBED 워커가 생기면 쌓인 것부터 읽는다. 아래 명령은 관리 서버에서 돈다.

### 켜졌는지

```bash
# /health — 503(BLOCKED)이어도 본문을 찍는다
kubectl -n ai exec deploy/ai -c ai -- python -c '
import urllib.request as u, urllib.error as e
try:
    r = u.urlopen("http://127.0.0.1:8000/health"); print(r.status, r.read().decode())
except e.HTTPError as x:
    print(x.code, x.read().decode())'
kubectl -n data exec redis-0 -- redis-cli XINFO CONSUMERS analysis.released extract   # 지금 Pod 이름의 소비자
kubectl -n data exec redis-0 -- redis-cli XPENDING analysis.released extract          # 가져갔지만 ACK 안 한 메시지
kubectl -n ai logs deploy/ai -c ai | grep "EXTRACT job="                              # 작업마다 한 줄
```

- 정상이면 `200 … "llm_mode":"gms","worker":"RUNNING"`. 키가 비거나 틀려 멈췄으면 `503 … "worker":"BLOCKED"` 와 `worker_reason`
- `deploy/ai` 는 Ready 인 Pod 를 먼저 고른다. 켤 때 키가 비어 새 Pod 가 Ready 가 안 되면 옛 Pod(mock · OFF)의 200 이 나온다. 그때는 `kubectl -n ai get pod -l app=ai` 로 새 Pod 이름을 골라 `deploy/ai` 대신 그 이름으로 exec 한다
- 로그 줄은 `SUCCEEDED` 또는 `FAILED(코드)`, `calls=`(GMS 가 답을 돌려준 횟수 — 시간 초과 · 5xx 로 다시 부른 것은 세지 않아 크레딧을 어림할 때는 덜 센다), `tokens=`, `W1=` 응답이다

### 기사에 분석 걸기 (B1 기사 투입, 기사마다 한 번)

배치 키를 서버 안에서 표준 입력으로 ai Pod 에 넘겨 화면 · 명령 기록에 안 남긴다. ai → backend 는 W1 길이라 정책(`services/app/netpol.yaml`) 안이다. `<ID>` 는 `article.id` 다. 켜져 있는 동안에는 기사마다 팀 공용 GMS 크레딧을 쓴다.

수집 배치(`infra/server/ingest.md`)는 2026-11-13 최종 파일 적재 · 확인 직후부터 15분마다 넣고 회차 끝에 몫만큼 B1 을 자동으로 건다(`auto`, 몫 = min(50, 5,000 − 오늘 건 수, 60 − EXTRACT 대기), AI 팀장 2026-11-10). 그 전(11/4 ~ 11/13 전환 전)은 넣기만이었다. **손으로 걸 때도 curl 로 B1 을 직접 부르지 않고 `release-only` 손 Job 으로 같은 몫 계산을 거친다**(`ingest.md` 「자동 투입」) — 하루 합계가 한 군데(작업 행)로 모인다. 자동 투입을 켠 뒤에는 분석 행이 생겨 덤프 「되돌리고 다시 적재」가 멈춘다(`infra/server/data-load.md` 9절, Jira 156). 처음에는 오류(인프라 — 로그 · 경보)와 GMS 크레딧(AI 팀장 — GMS 사용 현황 화면, 인프라에서는 볼 수 없다)을 같이 본다(2026-11-02 AI 팀장과 정함).

```bash
kubectl -n app get secret internal-api -o jsonpath='{.data.INTERNAL_BATCH_KEY}' | base64 -d \
  | kubectl -n ai exec -i deploy/ai -c ai -- python -c '
import os, sys, urllib.request as u, urllib.error as e
k = sys.stdin.read()
req = u.Request(os.environ["BACKEND_URL"] + "/internal/v1/articles/<ID>/release", data=b"", method="POST", headers={"X-Internal-Key": k})
try:
    r = u.urlopen(req, timeout=10); print(r.status, r.read().decode())
except e.HTTPError as x:
    print(x.code, x.read().decode())'
```

| 응답 | 뜻 (`docs/api-internal.md` 2절) |
| --- | --- |
| 202 | 걸었다 — 본문에 EXTRACT · EMBED 의 `jobId` |
| 401 | 배치 키가 없거나 틀리다 |
| 403 | 배치 키가 아니다(워커 키 등) |
| 404 | 그런 기사가 없다(번호 확인) |
| 409 | 이미 건 기사이거나 이미 화면에 있는 기사 |

### 끄기

켠 커밋(`ai.yaml`)을 `git revert` 해 `LLM_MODE` 를 `mock` 으로 되돌리는 MR. 새 Pod(OFF)가 뜨면 옛 Pod 가 소비를 멈춘다 — `/health` 의 `worker: OFF`, 옛 소비자의 idle 이 계속 는다. 되돌리면 `ai.yaml` · `kustomization.yaml` · `services/app/netpol.yaml` 의 주석과 이 절의 「2026-11-02 부터 gms」가 mock 상태와 어긋나니 같은 MR 이나 바로 다음 MR 에서 고친다. 급할 때 · 코드 문제일 때 · Argo CD 를 멈춰야 할 때는 계획의 「되돌리는 법」.

### 내릴 때 처리 중이던 작업

preStop 10초(이때도 큐를 읽는다) → 종료 신호 → 하던 작업을 20초 기다린다. 못 끝내면 ack 없이 끊기고, 마지막 전달 뒤 20분 넘게 ACK 가 없으면 다음 Pod 가 가져가 GMS 를 다시 부른다. 그래서 배포와 겹친 작업은 약 20분 늦고 GMS 를 두 번 쓴다.

### 키를 바꿀 때

위 「GMS 키」 두 명령으로 봉인 파일을 바꾼 MR 을 반영한 뒤 `kubectl -n ai rollout restart deploy/ai`. Pod 는 env 를 시작할 때만 읽는다. 키가 틀려 `BLOCKED` 가 되면 워커는 새 메시지를 더 가져가지 않는다. 남는 것은 막힐 때 처리하던 한 건뿐이고, 마지막 전달 뒤 20분이 지나면 다시 띄운 Pod 가 그 메시지를 가져가 GMS 를 다시 부른다.

## 실시간 연결 켜기 — EMBED · 판정 · 이슈 (2026-11-14, Jira S15P31A102-207)

새 기사가 사건 · 이슈에 붙게 하는 세 워커다. 플래그는 `infra/k8s/services/ai/ai.yaml` 에 있고 Argo CD 가 따라가므로 **MR 로** 바꾼다.

| 플래그 | 무엇 | 끄면 |
|---|---|---|
| `EMBED_WORKER_ENABLED` | 기사 벡터를 만든다(CPU 2스레드, 기사당 약 4.3초) | 벡터가 안 생겨 판정도 멈춘다 |
| `MATCH_EVENT_WORKER_ENABLED` | 같은 사건인지 판정하고 새 사건을 짓는다(GMS) | 새 기사가 사건에 안 붙는다 |
| `ISSUE_WORKER_ENABLED` | 새 사건을 이슈에 붙이거나 새 이슈를 만든다(GMS) | 새 사건이 이슈 밖에 남는다 |

**판정은 한 번에 한 건씩만 돈다.** 같은 사건 기사 둘이 같이 판정되면 서로를 후보로 못 봐 사건이 갈라지기 때문이다(`MatchDispatcher`). 운영 GMS 한 번이 가운데 14초 · 상위 10% 24초(2026-11-13 EXTRACT 2,402건 실측)라 시간당 **약 240건**이 한계인데 15분 수집이 시간당 200건을 넣는다. 여유가 20% 안쪽이다.

### 켜기 전에

1. **기사 벡터가 들어가 있나** — `data-load.md` 10절. 없으면 새 기사가 후보 사건을 하나도 못 받아 모두 새 사건이 된다
2. **밀린 EMBED 를 건너뛴다** — `embed-backlog-skip.sql`. 안 하면 발행이 이른 밀린 기사부터 집어서 **가장 새 기사가 가장 늦게 붙는다**
3. **`embed` 그룹을 스트림 끝으로 옮긴다** — 건너뛴 작업의 옛 메시지를 워커가 읽지 않게

   ```bash
   kubectl -n data exec redis-0 -- redis-cli XGROUP SETID analysis.released embed '$'
   kubectl -n data exec redis-0 -- redis-cli XINFO GROUPS analysis.released
   ```

4. **백업과 스냅숏** — `db-backup.md` 의 손 백업, 그리고 `realtime-snapshot.sql`

   이슈 워커가 ATTACH 하면 **기존 이슈 요약을 새 사건까지 넣어 다시 쓴다.** 사건 시점(`occurred_at`)과 이슈 분야도 바뀐다. 백업만으로 되돌리면 켠 뒤 들어온 기사까지 사라지므로, 네 표(`issue` · `event` · `article_event` · `issue_category`)를 `rt_before` 스키마에 떠 둔다.

   ```bash
   { echo 'begin;' && cat realtime-snapshot.sql && echo 'commit;'; } | kubectl -n data exec -i postgres-0 -- psql -X -v ON_ERROR_STOP=1 -U newlearn -d newlearn
   ```

   되돌릴 때는 **세 플래그를 false 로 되돌리고 ai Pod 가 바뀐 뒤** `realtime-restore.sql`. 켠 뒤 생긴 사건 · 이슈 · 연결을 지우고 남은 것을 스냅숏 값으로 되돌린 다음, 스냅숏과 같은지 단언한다. 기사 · 마인드맵 · 공개 여부와 분석 작업 행은 건드리지 않는다 — 작업 행을 지우면 그 기사가 다시 판정 줄에 선다.

### 켜기 · 끄기

`ai.yaml` 의 세 값을 `"true"` 로 바꾸는 MR 하나. 되돌릴 때는 **이름이 아니라 값**을 되돌린다(`"false"`).

### 켠 뒤 보기

```bash
kubectl -n ai logs deploy/ai -c ai --since=10m | grep -E "EMBED job=|MATCH_EVENT job=|ISSUE job="
kubectl -n data exec postgres-0 -- psql -U newlearn -d newlearn -c \
  "select stage, status, count(*) from analysis_job where finished_at > now() - interval '1 hour' group by 1,2 order by 1,2"
kubectl -n data exec postgres-0 -- psql -U newlearn -d newlearn -c \
  "select count(*) from analysis_job where stage='MATCH_EVENT' and status='QUEUED'"
```

- 판정 줄이 막히면 backend 로그에 `판정 줄이 멈췄을 수 있다` WARN 이 뜬다(40분 넘게 `QUEUED`)
- 판정이 시간당 200건을 못 따라가면 회차 몫 `INGEST_RELEASE_PER_RUN`(기본 50)을 낮춘다 — `ingest.md`
- 🔴 **이슈 분야 고정 28개가 풀린다.** ATTACH 는 이름은 두고 요약만 다시 쓰지만 분야는 다시 계산한다(`IssueResultHandler.refreshCategory` — `clear` 뒤 다수결). 고정 목록을 보지 않는다. 매일 아침 분야 라벨 적용(`category-labels-apply.sql`)이 28개를 다시 세우므로, 발표 전날 아침에는 적용을 꼭 돌린다(`category-labels.md`)
- ATTACH 가 **기존 이슈 요약을 다시 쓴다.** 발표에 쓸 이슈 요약이 바뀌는 것이 싫으면 `ISSUE_WORKER_ENABLED` 만 false 로 둔다 — 판정은 돌아 새 사건은 생기고 이슈 밖에 남는다
