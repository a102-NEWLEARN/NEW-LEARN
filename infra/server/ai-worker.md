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

봉인 파일은 `kustomization.yaml` 에 넣어 Secret `gms-api` 를 만든다(2026-10-27 봉인 · 반영). 2026-11-02 부터 `ai.yaml` 이 `GMS_API_KEY`(`secretKeyRef` `gms-api` / `GMS_API_KEY`)로 읽는다 — 아래 「실제 모드 켜기 · 끄기」. 키를 바꿀 때는 위 두 명령으로 봉인 파일만 바꿔 커밋한다(ai 는 다시 띄워야 새 키를 읽는다).

## 실제 모드 켜기 · 끄기

2026-11-02 부터 `ai.yaml` 이 `LLM_MODE=gms` 다(Jira S15P31A102-115, 계획 `docs/plans/2026-11-02-ai-real-mode-switch.md`). 지금 도는 것은 EXTRACT(마인드맵 추출)뿐이다. EMBED 작업은 소비자가 없어 `embed` 그룹에 쌓이고, EMBED 워커가 생기면 쌓인 것부터 읽는다. 아래 명령은 관리 서버에서 돈다.

- 켜졌는지
  - `kubectl -n ai exec deploy/ai -c ai -- python -c 'import urllib.request as u; print(u.urlopen("http://127.0.0.1:8000/health").read().decode())'` — `"llm_mode":"gms"` · `"worker":"RUNNING"`. 키가 비거나 틀려 멈췄으면 503 과 `"worker":"BLOCKED"` · `worker_reason`
  - `kubectl -n data exec redis-0 -- redis-cli XINFO CONSUMERS analysis.released extract` — 지금 Pod 이름의 소비자. `XPENDING analysis.released extract` 는 가져갔지만 ACK 안 한 메시지
  - `kubectl -n ai logs deploy/ai -c ai | grep "EXTRACT job="` — 작업마다 한 줄(`SUCCEEDED` 또는 `FAILED(코드)`, `calls=` GMS 호출 수, `tokens=`, `W1=` 응답)
- 기사에 분석 걸기(B1 기사 투입, 기사마다 한 번) — 배치 키를 서버 안에서 표준 입력으로 ai Pod 에 넘겨 화면 · 명령 기록에 안 남긴다. ai → backend 는 W1 길이라 정책(`services/app/netpol.yaml`) 안이다. `<ID>` 는 `article.id`

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

  202 면 걸었다(본문에 EXTRACT · EMBED 의 `jobId`). 409 는 이미 건 기사, 404 는 없거나 번호가 틀린 기사다. 켜는 순간부터 기사마다 팀 공용 GMS 크레딧을 쓴다
- 끄기 — 켠 커밋(`ai.yaml`)을 `git revert` 해 `LLM_MODE` 를 `mock` 으로 되돌리는 MR. 새 Pod(OFF)가 뜨면 옛 Pod 가 소비를 멈춘다 — `/health` 의 `worker: OFF`, 옛 소비자의 idle 이 계속 는다. 급할 때 · 코드 문제일 때 · Argo CD 를 멈춰야 할 때는 계획의 「되돌리는 법」
- 내릴 때 처리 중이던 작업 — preStop 10초(이때도 큐를 읽는다) → 종료 신호 → 하던 작업을 20초 기다린다. 못 끝내면 ack 없이 끊기고, 마지막 전달 뒤 20분 넘게 ACK 가 없으면 다음 Pod 가 가져가 GMS 를 다시 부른다. 그래서 배포와 겹친 작업은 약 20분 늦고 GMS 를 두 번 쓴다
- 키를 바꿀 때 — 위 「GMS 키」 두 명령으로 봉인 파일을 바꾼 MR 을 반영한 뒤 `kubectl -n ai rollout restart deploy/ai`. Pod 는 env 를 시작할 때만 읽는다. 키가 틀려 `BLOCKED` 였던 동안 가져간 메시지는 다시 띄운 뒤 20분이 지나야 처리된다
