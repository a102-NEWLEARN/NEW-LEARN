# AI 워커 실제 모드 전 인프라 준비 — 모델 자리 · GMS 키 · ai 자원

## 무엇을 / 왜

ai 워커는 지금 `LLM_MODE=mock` 이라 메모리를 50MiB 안팎만 쓴다. AI 코드가 SSAFY GMS 호출과 임베딩(BGE-m3-ko, 1024차원)을 켜면 세 가지가 필요하다. 모델 파일 2.29GB 를 둘 곳, 최대 메모리 약 3.1~3.6GB(입력은 기사 앞 800자 — AI 팀 답), GMS 키다.
지금 매니페스트(`infra/k8s/services/ai/ai.yaml` — 요청 256Mi · 상한 1Gi, 키 없음, 모델 자리 없음)로는 Pod 가 OOM 으로 죽거나 키가 없어 뜨지 않는다. AI 코드가 dev 에 들어오기 전에 인프라 쪽을 갖춘다.

## 결론

- **모델은 PVC 에 한 번 받아 둔다** — 이미지와 굽기는 그대로 두고, 첫 Pod 만 약 51초 더 걸린다
- **모델은 `dragonkue/BGE-m3-ko`, 커밋 `7074d66a…` 로 고정한다** — AI 팀 확인 · 요청(2026-10-26)
- **ai 자원: 요청 CPU 500m · 메모리 4Gi, 상한 메모리 5Gi.** 배포 중 ai 2개에 굽기 잡 2개가 겹쳐도 워커 메모리 요청은 81%다
- **워커는 하나, 모델은 한 번만 올린다** — AI 팀 확인. EXTRACT 의 GMS 동시 호출은 한 워커 안에서 한다
- **GMS 키는 `seal-secrets.sh gms` 로 사용자가 봉인한다** → Secret `gms-api` → env `GMS_API_KEY`
- MR 은 둘로 나눈다. ① 모델 자리 · 자원 · 봉인 스크립트(mock 그대로) ② 봉인 파일 · `LLM_MODE=gms`(AI 코드가 dev 에 들어온 뒤)
- MR 1 을 막던 AI 팀 답(모델 · 입력 길이 · 워커 수)은 받았다. 남은 질문(맨 아래)은 MR 2 전까지 받으면 된다

## 잰 값 (2026-10-26, 읽기만 했다)

### 노드

| | 워커 (Lightsail) | 관리 서버 (EC2) |
|---|---|---|
| 할당 가능 CPU · 메모리 | 4 · 15,684Mi (15.3Gi) | 2 · 7,716Mi — control-plane taint, 서비스 Pod 를 올리지 않는다 |
| 요청 합 CPU · 메모리 | 1000m (25%) · 2,794Mi (17%) | 1250m (62%) · 1,434Mi (18%) |
| 메모리 상한 합 | 10,432Mi (66%) | 4,116Mi (53%) |
| 지금 사용 CPU · 메모리(working set) | 175m · 2,461Mi | 311m · 3,519Mi |
| 최대 메모리 사용 (MemTotal − MemAvailable, 10-22 부터 4일) | 3.27GiB · MemAvailable 최소 12.1GiB | — |
| 최대 CPU (5분 평균) · steal 최대 | 2.48코어 · 0.32코어 | — |
| 디스크 `/` | 309G 중 21G 사용, 288G 남음 — local-path 폴더도 같은 디스크 | — |
| swap | 없음 | — |

- ai Pod 는 워커에 떠 있다(30시간째). 4일 동안 메모리 최대 52MiB
- `kubectl top` 은 안 된다 — metrics-server 가 없다. kubelet 요약 API 와 Prometheus 로 쟀다
- 워커 요청 합 1000m 중 100m · 상한 1Gi 는 cilium 의 init 컨테이너(`install-cni-binaries`) 몫이다. `kubectl describe node` 가 init 컨테이너까지 넣어 센다
- 굽기 잡 Pod 는 워커에서 돈다. 요청 500m · 1Gi, 상한 CPU 2 · 메모리 3Gi, 동시 2개(`SSOT.md` 6절 「굽기 러너」). 4일 최대 사용(usage, 캐시 포함) 3.0GiB 로 상한에 닿았다

### 모델 · 바깥 연결

- `dragonkue/BGE-m3-ko`(Hugging Face, apache-2.0, 받기 제한 없음) 최신 커밋 `7074d66aa46562342193ca4feb3d89bf9dad71b4`(2025-10-16). 파일 합 2.29GB, 그중 `model.safetensors` 2,271MB(fp32). AI 팀 확인(2026-10-26): 팀원의 품질 비교 · CPU 측정 모두 이 모델이고, 바뀌지 않게 커밋을 고정해 달라고 했다. 허깅페이스에는 비슷한 이름(`upskyy/bge-m3-korean` · `HyperBlaze/BGE-m3-ko` 등)이 여럿 있다
- 워커에서 HF 받기: 모델 파일 앞 200MB 를 받아 버리니 평균 44.6MB/s → 2.27GB 면 약 51초. 한 번 잰 값이다
- 워커에서 GMS: `GET https://gms.ssafy.io/gmsapi/api.openai.com/v1/models` 를 키 없이 부르면 401, 0.07초 — 길은 열려 있다. ai 네임스페이스에는 네트워크 정책이 없다
- ai Pod 안
  - `hf` 명령이 있다(`/app/.venv/bin/hf`, huggingface-hub 1.33.0)
  - torch 2.14.1+cpu 의 기본 스레드는 2다(vCPU 4, `os.cpu_count()` 4). AI 담당이 잰 2스레드와 같다
  - `HOME=/`, uid 10001 이다. 그래서 HF 기본 캐시 자리(`~/.cache/huggingface`)에 쓸 수 없다 — 자리를 따로 줘야 한다
- local-path 는 PVC 폴더를 0777 로 만든다(redis · postgres 폴더 확인). uid 10001 도 쓸 수 있다
- 워커 노드의 ai 이미지는 태그 5개, 각 522~541MB(압축)
- AI 담당이 잰 값(`SSOT.md` 10절 2026-10-23): 리드는 기사당 1.16초 · 2.6GB, 앞 800자는 4.27초 · 3.1GB(CPU 2스레드)
- AI 팀 답(2026-10-26): 입력은 **기사 앞 800자**로 정했다. CPU 2스레드에서 기사당 약 4.3초, 최대 메모리 약 3.1~3.6GB 라 워커 메모리를 약 4GB 로 잡아 달라고 했다(3GB 는 빠듯함)

### 쓴 명령

```bash
ssh newlearn 'kubectl describe node <노드>'                      # Capacity · Allocatable · Allocated resources
ssh newlearn 'kubectl get --raw /api/v1/nodes/<노드>/proxy/stats/summary'   # 노드 · Pod 실제 CPU · 메모리
ssh newlearn 'kubectl get pods -A --field-selector spec.nodeName=<워커> -o json'   # Pod 별 요청 · 상한 (init 포함)
ssh newlearn 'kubectl get --raw "/api/v1/namespaces/monitoring/services/kps-kube-prometheus-stack-prometheus:9090/proxy/api/v1/query?query=…"'
#   max_over_time((node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes)[7d:1m]) · min_over_time(node_memory_MemAvailable_bytes[7d])
#   max_over_time(sum(rate(node_cpu_seconds_total{mode!="idle"}[5m]))[7d:5m]) · 같은 식 mode="steal"
#   max_over_time(max(container_memory_usage_bytes{namespace="gitlab-runner-build"})[7d:1m]) · ai 컨테이너 working set
ssh new 'free -m; df -h /; sudo crictl images; sudo stat -c "%a %U:%G %n" /var/lib/newlearn/local-path/*'
ssh new 'curl -sL -r 0-209715199 -o /dev/null -w "%{speed_download}" https://huggingface.co/dragonkue/BGE-m3-ko/resolve/main/model.safetensors'
ssh new 'curl -s -o /dev/null -w "%{http_code}" https://gms.ssafy.io/gmsapi/api.openai.com/v1/models'
ssh newlearn 'kubectl -n ai exec deploy/ai -- sh -c "ls /app/.venv/bin/hf; python -c \"import torch; print(torch.get_num_threads())\"; id"'
curl -s "https://huggingface.co/api/models/dragonkue/BGE-m3-ko?blobs=true"   # 파일 크기 (관리자 PC)
```

## 모델 자리 — 세 안

| | A. 이미지에 굽기 | **B. PVC 에 받아 두기 (고름)** | C. 시작할 때마다 받기 |
|---|---|---|---|
| ai 이미지 (압축) | 541MB → 약 2.6~2.8GB. fp32 가중치는 거의 압축되지 않는다고 보고 더한 값이다(재지 않음) | 541MB 그대로 | 541MB 그대로 |
| 굽기 메모리 (Kaniko 상한 3Gi) | 지금도 상한에 닿는다(memory.peak 3Gi, 부딪힌 횟수 382 ~ 16919). 2.3GB 층이 더해지면 상한을 올리고 다시 재야 한다. 캐시 층은 압축 없이 올라가서(`--compressed-caching=false`) 굽기마다 2.3GB 를 다시 받는다 | 그대로 | 그대로 |
| Pod 시작 | 노드에 이미지가 있으면 모델 읽기만 한다. 모델 층이 처음 바뀔 때 2.3GB 를 받는다 | 처음 한 번 약 51초 받기 + 읽기. 그 뒤로는 읽기만 | 배포 · 재시작 · OOM 때마다 약 51초 + 읽기 |
| 노드 디스크 (남은 288G) | 모델 층 한 벌 2.3GB | PVC 에 한 벌 2.3GB. 판을 바꾸면 한 벌씩 늘고 손으로 지운다 | Pod 마다 emptyDir 2.3GB. 배포 중에는 두 벌 |
| 바깥 의존 | 굽기 때만 HF | 처음 채울 때만 HF | 매번 HF — HF 가 막히면 새 Pod 가 안 뜬다 |
| 바꿀 곳 | Dockerfile · `.gitlab-ci.yml` · 굽기 러너 상한 | `ai.yaml` · PVC 파일 | `ai.yaml` |

B 를 고른 까닭: 이미 상한에 닿은 굽기를 건드리지 않는다. 굽기 시간도 늘지 않는다. HF 에는 처음 한 번만 기댄다.
모델 읽기 시간(디스크 → 메모리)은 아직 안 쟀다. A · B 의 차이는 없고, 구현 때 잰다.

## 정한 것 (승인받을 것)

| 항목 | 정한 것 |
|---|---|
| 모델 자리 | PVC `ai-model-cache`(ai 네임스페이스, StorageClass `newlearn-local`, ReadWriteOnce, 10Gi). local-path 는 크기를 막지 않아서 10Gi 는 표시일 뿐이다. 워커가 한 대라 배포 중 새 · 옛 Pod 가 같은 노드에서 같이 붙는다 |
| 받는 법 | ai 이미지를 그대로 쓰는 init 컨테이너가 `hf download dragonkue/BGE-m3-ko --revision 7074d66aa46562342193ca4feb3d89bf9dad71b4 --local-dir /models/BGE-m3-ko-<커밋>` 을 돈다(커밋은 AI 팀 요청으로 고정). 다 받으면 그 폴더에 `.done` 을 남긴다. `.done` 이 있으면 받지 않고 바로 끝난다. 고정 이름 링크 `/models/BGE-m3-ko` 를 그 폴더로 바꿔 끼운다(`mv -T` 로 한 번에). 모델 이름 · 커밋은 init 컨테이너 env 한 곳에만 적는다 |
| 앱이 읽는 법 | 앱은 경로 `/models/BGE-m3-ko` 에서 읽는다. 받아 오지는 않는다(`HF_HUB_OFFLINE=1`). 캐시가 쓸 자리로 `HF_HOME=/models/hf` 도 준다(`HOME=/` 라서). 경로를 담을 env 이름은 AI 코드가 정한다(남은 질문 1). 답이 MR 1 전에 없으면 그 env 는 MR 2 에서 AI 코드에 맞춰 더한다 |
| ai 자원 | 요청 CPU 500m · 메모리 4Gi, 상한 메모리 5Gi. 4Gi 는 AI 팀이 잡아 달라고 한 값이고, 최대 3.6GB(= 3.35GiB, GiB 라면 3.6GiB)를 덮는다. 상한은 최대치 위로 1.4GiB 이상을 남긴다. CPU 상한은 두지 않는다 — 다른 서비스와 같다. torch 는 기본 2스레드라 많아야 약 2코어를 쓴다 |
| init 컨테이너 자원 | 요청 CPU 50m · 메모리 128Mi, 상한 메모리 1Gi. 구현 때 재서 줄인다 |
| 시작 확인 | startupProbe(`tcpSocket http`, 5초마다, 36번 = 3분)를 더한다. 지금 livenessProbe 는 20초 × 3번이라, 모델을 읽는 동안 포트가 늦게 열리면 약 60초에 재시작된다. readiness · liveness 는 그대로 둔다 |
| 교체 전략 | RollingUpdate(maxSurge 1 · maxUnavailable 0) 그대로 둔다. 새 Pod 가 모델을 다 읽고 포트를 연 뒤에 옛 Pod 가 내려간다 |
| GMS 키 | Secret `gms-api`(ai), 키 `GMS_API_KEY`. `infra/server/seal-secrets.sh gms` 를 새로 둔다. 사용자가 EC2 터미널에서 값을 넣는다(`read -rs`, 화면 · ps 에 안 남음). 봉인 전에 그 키로 `GET <GMS_BASE_URL>/models` 를 불러 200 인지 본다. 키는 curl 설정을 표준 입력으로 넘긴다 — `ghcr` · `mattermost` 기능과 같은 방식이다. 기존 `seal()` 함수를 쓴다 |
| 키를 env 로 | `GMS_API_KEY` ← `secretKeyRef`(`gms-api` / `GMS_API_KEY`). 봉인 파일은 `infra/k8s/services/ai/sealed-gms-api.yaml` |
| 비밀이 아닌 값 | `GMS_BASE_URL=https://gms.ssafy.io/gmsapi/api.openai.com/v1`(`SSOT.md` 10절) · `GMS_MODEL=gpt-6-luna` 를 Deployment env 에 평문으로 둔다. 봉인 스크립트는 이 주소를 `ai.yaml` 에서 읽는다. 같은 값을 두 곳에 적지 않으려는 것이다 |
| 실제 모드 켜기 | `LLM_MODE=gms` — `ai/app/llm.py` 가 받는 값이다. 두 번째 MR 에서만 바꾼다 |

### 워커에 들어가나 (할당 가능 메모리 15,684Mi · CPU 4000m)

「지금」은 2026-10-26 오후에 다시 읽은 값이다(아침과 같음). ai 는 지금 요청 50m · 256Mi, 상한 1Gi 다.

| | 지금 | 바꾼 뒤 (ai 1개) | 배포 중 (ai 2개) | + 굽기 잡 2개 |
|---|---|---|---|---|
| 메모리 요청 | 2,794Mi (17%) | 6,634Mi (42%) | 10,730Mi (68%) | 12,778Mi (81%) |
| CPU 요청 | 1000m (25%) | 1450m (36%) | 1950m (49%) | 2950m (74%) |
| 메모리 상한 합 | 10,432Mi (66%) | 14,528Mi (93%) | 19,648Mi (125%) | 25,792Mi (164%) |

- 계산: 지금 값에서 ai 몫(256Mi · 1Gi · 50m)을 빼고 새 값(4Gi · 5Gi · 500m)을 더했다. 배포 중에는 ai 를 한 벌 더 넣었고, 굽기 잡은 둘(하나에 요청 500m · 1Gi, 상한 3Gi)을 넣었다
- 요청은 가장 나쁜 겹침에서도 81% 다. 그때도 2,906Mi 가 남는다. 배포 중인 새 ai Pod 는 이미 표에 들어 있어서 `SSOT.md` 6절 「배포 순간 Pod 1개 분량의 메모리 여유」를 지킨다
- 상한 합은 100% 를 넘는다. 실제 사용으로 어림하면 4일 최대 3.27GiB + ai 2개 × 3.6GB ≈ 10.0GiB(GiB 라면 10.5GiB)다. 할당 가능 15.3GiB 의 65 ~ 68% 다. 굽기 잡의 3Gi 는 대부분 디스크 캐시라 돌려받을 수 있다

## 작업 순서

### 0 — 착수 전
- [x] AI 팀 답(2026-10-26) — 모델 · 커밋 고정, 입력 앞 800자 · 메모리 약 4GB, 워커 하나. 자원 값을 고쳤다(끝의 「계획 뒤 바뀐 것」)
- [ ] 고친 계획을 사용자가 다시 승인
- [ ] Jira 티켓 — 사용자 지시가 있을 때 만든다(스토리 포인트 칸 채움)

### A — MR 1: 모델 자리 · 자원 · 봉인 스크립트 (LLM_MODE 는 mock 그대로)
- [ ] `infra/k8s/services/ai/model-cache.yaml`(새) — PVC `ai-model-cache`
- [ ] `infra/k8s/services/ai/ai.yaml` — init 컨테이너 `model`(위 「받는 법」, securityContext 는 본 컨테이너와 같게), 볼륨 `/models`, 본 컨테이너 env(`HF_HOME` · `HF_HUB_OFFLINE` · `GMS_BASE_URL` · `GMS_MODEL`, 모델 경로는 env 이름을 받았을 때만), 자원(요청 500m · 4Gi, 상한 5Gi), startupProbe. 머리 주석 두 줄 갱신
- [ ] `infra/k8s/services/ai/kustomization.yaml` — resources 에 `model-cache.yaml`
- [ ] `infra/server/seal-secrets.sh` — `gms` 기능, 머리 쓰는 법 한 줄(`usage()` 의 `sed -n '5,11p'` → `'5,12p'`)
- [ ] `infra/server/README.md` — 「봉인한 Secret 만들기」에 `gms` 한 줄, ai 모델 캐시 확인 · 판 바꾸기 · 옛 판 지우기
- [ ] 확인: `kubectl kustomize infra/k8s/services/ai` 렌더, EC2 에서 `kubectl apply --dry-run=server -k`, 커밋 게이트(infra 포맷 · 린트 · 테스트 — `bash -n` 포함), shellcheck
- [ ] MR → infra → dev(머지 직전 원격 dev · 열린 MR 다시 확인). 반영 뒤 검증 절 A

### B — 사용자가 봉인 (MR 1 이 EC2 저장소에 들어온 뒤)
- [ ] 🧑 사용자 — EC2 에서 `bash infra/server/seal-secrets.sh gms`(`ssh -t`). 200 이 나와야 봉인한다
- [ ] 봉인 파일을 관리자 PC 로 가져와 `infra/k8s/services/ai/sealed-gms-api.yaml` 로 둔다

### C — MR 2: 실제 모드 (AI 코드가 dev 에 들어오고 AI 팀이 켜자고 한 뒤)
- [ ] `kustomization.yaml` 에 `sealed-gms-api.yaml`, `ai.yaml` 에 `GMS_API_KEY`(secretKeyRef) · `LLM_MODE=gms`. MR 1 에서 모델 경로 env 를 못 넣었으면 AI 코드가 읽는 이름으로 여기서 더한다
- [ ] MR → infra → dev. 반영 뒤 검증 절 C
- [ ] `SSOT.md` 6절(ai 자리 · 키) · 10절(잰 값) — 메인 세션의 BE 문서 작업과 겹치지 않을 때 같은 MR 이나 다음 MR 로

## 바꿀 파일

- 새: `infra/k8s/services/ai/model-cache.yaml` · `infra/k8s/services/ai/sealed-gms-api.yaml`(사용자가 봉인)
- 고침: `infra/k8s/services/ai/ai.yaml` · `infra/k8s/services/ai/kustomization.yaml` · `infra/server/seal-secrets.sh` · `infra/server/README.md` · `SSOT.md` 6 · 10절(C 에서)
- 승인한 계획 사본: `docs/plans/2026-10-26-ai-real-mode-infra.md`

## 안 바꿀 것

- `ai/` 코드 · `ai/Dockerfile` · `pyproject.toml` — 모델을 읽는 코드와 GMS 호출은 AI 팀 몫이다
- `.gitlab-ci.yml` · 굽기 러너 상한 · Kaniko 옵션 — B 안이라 그대로 둔다
- `compose.yaml` · `.env.example` — 로컬 개발의 모델 자리는 AI 팀이 정한다. 키 이름은 이미 있다
- 다른 서비스(backend · DB · Redis · Argo CD)의 자원 · 설정, replicas(1 그대로)
- `/health` 의 판정 대상 — GMS 는 넣지 않는다(`.claude/stack.md` 5절 L2)
- 수집 배치 — 보류 그대로(`SSOT.md` 8절). 실제 모드를 켜도 기사는 사람이 넣는 것만 돈다
- `docs/api*.md` · `docs/data-model.md` — 이 일과 상관없다
- GKE 컨텍스트 · 관리 서버 노드

## 리스크

- **AI 코드가 경로 env 를 읽지 않고 모델 이름으로 허깅페이스에서 받으려 한다** → `HF_HUB_OFFLINE=1` 이라 받지 못하고 멈춘다(조용히 다른 판을 받지는 않는다). 남은 질문 1 로 맞춘다
- **모델을 읽는 동안 liveness 가 Pod 를 죽인다** → startupProbe 3분. 읽는 시간을 구현 때 재서 줄인다
- **HF 가 막히거나 느려 첫 받기가 실패한다** → init 컨테이너가 실패하고 다시 돈다. 옛 Pod 는 남는다(maxUnavailable 0). 한 번 채우면 다시 기대지 않는다
- **HF 받기 도구(hf-xet)가 PVC 에 캐시를 더 쌓는다** → 받은 뒤 `du -sh` 로 본다. 2.3GB 를 크게 넘으면 그 캐시를 끄는 설정을 찾는다(미확인)
- **Lightsail 은 버스트형이다**(계속 쓸 수 있는 CPU 약 1.6 vCPU, `SSOT.md` 6절). 앞 800자는 기사당 약 4.3초를 2코어로 쓴다 — 한 번에 500건이 들어오면 약 36분 동안 2코어다(500건은 가정한 숫자). 한꺼번에 수천 건을 임베딩하면 크레딧이 줄어 노드 전체가, 곧 사이트도 느려진다. 남은 질문 2. 켠 뒤에는 steal(지금 최대 0.32코어)과 사이트 health 를 본다
- **상한 합 164%** → 실제 사용이 한꺼번에 늘면 OOM · 축출이 날 수 있다. 어림한 실제 사용은 65 ~ 68%다. 넘으면 ai 교체 전략을 Recreate(옛 Pod 먼저 내림 — 큐가 기다려 줌)로 바꾸는 안이 있다
- **GMS 크레딧** → `LLM_MODE=gms` 부터 기사마다 팀 공용 크레딧을 쓴다. 수집 배치가 꺼져 있어 들어오는 기사 수는 사람이 정한다
- **키가 샘** → 저장소에는 봉인 파일만 있다. 평문은 Pod env 안에만 있고, 그 env 는 kubectl 권한이 있는 사람(인프라 담당)만 본다. 새면 키를 새로 받아 다시 봉인한다

## 어떻게 검증하나

- **A (MR 1 반영 뒤)**
  - Argo CD `ai` Synced · Healthy, `kubectl -n ai get pvc ai-model-cache` Bound(워커)
  - init 컨테이너 로그에 받은 시간이 찍힌다. 워커에서 모델 폴더 `du -sh` ≈ 2.29GB, `.done` 이 있고 링크가 그 폴더를 가리킨다
  - `kubectl -n ai rollout restart deploy/ai` → init 이 받지 않고 몇 초 안에 끝난다
  - init 컨테이너 메모리 최대(kubelet 요약 API · Prometheus)가 1Gi 안이다
  - `kubectl describe node <워커>` 요청 합이 위 표 「바꾼 뒤」와 맞는다(메모리 약 6,634Mi)
  - Pod 안 `/health` UP(mock), 교체 동안 관리자 PC 에서 1초마다 `curl https://newlearn.io.kr/actuator/health` → 실패 0
- **B (봉인)**
  - 스크립트가 200 을 받은 뒤에만 봉인 파일을 쓴다. 틀린 키로 한 번 돌려 401 · 봉인 안 함을 본다
- **C (MR 2 반영 뒤)**
  - `kubectl -n ai get secret gms-api` 가 있다(값은 출력하지 않는다). Pod 안 `printenv | grep -c '^GMS_API_KEY='` → 1
  - `/health` 의 `llm_mode` 가 `gms`
  - BE 가 시험 기사 1건을 넣는다 → `EXTRACT` · `EMBED` 결과가 W1 로 저장된다(BE 확인)
  - ai 컨테이너 메모리 최대(`container_memory_working_set_bytes`)가 요청 4Gi · 상한 5Gi 안(AI 팀 값 3.1~3.6GB 와 견줌), CPU 사용 · 워커 steal · 사이트 health 를 같은 시간대에 본다. 잰 값은 `SSOT.md` 10절로

## 되돌리는 법

- **MR 1**: Revert MR → Argo CD 가 이전 Deployment 로 맞춘다. PVC 는 지워지고(prune), PV 는 Retain 이라 워커 폴더가 남는다 — 캐시일 뿐이니 `kubectl delete pv` 와 워커의 그 폴더를 손으로 지운다. 되돌릴 수 없는 것은 없다
- **MR 2**: Revert MR → `LLM_MODE=mock` 으로 돌아오고, 봉인 파일이 빠지면 Secret 도 지워진다. 🔴 이미 쓴 GMS 크레딧과 이미 저장된 분석 결과는 돌아오지 않는다(`.claude/stack.md` 6절)
- **키를 바꿀 때**: 사용자가 `seal-secrets.sh gms` 를 다시 돌려 봉인 파일을 바꾼다

## AI 팀에 물을 것 (남은 것 — MR 2 전까지)

답을 받아 지운 것: 모델 주소 · 커밋, 입력 길이, 워커 수(2026-10-26). 모델 읽는 시간은 묻지 않고 MR 1 뒤 우리 서버에서 잰다. torch 스레드는 Pod 기본 2가 AI 팀이 잰 조건과 같아 묻지 않는다.

1. **모델 경로 env** — 서버는 모델을 `/models/BGE-m3-ko` 폴더에 받아 둡니다. AI 코드가 그 경로를 어떤 env 이름으로 읽나요? (env 가 없으면 노트북처럼 모델 이름을 쓰게)
2. **한꺼번에 임베딩** — 데이터셋(2024~2025)을 서버에서 한꺼번에 임베딩할 계획이 있나요? 있다면 몇 건인가요? 서버 CPU 가 버스트형이라 오래 돌리면 사이트가 느려집니다
3. **GMS** — 서버에 넣을 키는 누구 것인가요(사용자와 같이 정함)? 키 확인으로 `GET /models` 가 200 을 주나요(크레딧이 안 드는 호출)? `gpt-6-luna` · 위 `GMS_BASE_URL` 그대로인가요?
4. **켜는 때** — 임베딩 · GMS 코드가 dev 에 들어오는 날, 첫 시험 기사 수는?
5. **준비 판정** — `/health` 에 모델 준비 여부를 넣을 건가요(readiness)?

## 계획 뒤 바뀐 것

2026-10-26 오후, AI 팀 답을 받아 고쳤다(처음 승인은 같은 날 오전, 커밋 151a52e).

| 무엇 | 처음 | 바꾼 것 | 까닭 |
|---|---|---|---|
| ai 메모리 | 요청 3Gi · 상한 4Gi | 요청 4Gi · 상한 5Gi | 입력이 앞 800자로 정해졌고 최대 3.1~3.6GB, AI 팀이 약 4GB 를 요청 |
| 워커 메모리 요청 (가장 나쁜 겹침) | 68% | 81% | 위 값으로 다시 계산. 들어간다 |
| 모델 커밋 | 고정 제안 | `7074d66a…` 로 확정 | AI 팀이 이 모델을 확인하고 고정을 요청 |
| 착수 조건 | AI 답 1~4번 | MR 1 은 다시 승인만 있으면 된다 | 막던 답(모델 · 입력 길이 · 워커 수)을 받음 |
| 모델 경로 env | MR 1 에 넣음 | 이름을 받았을 때만 MR 1, 아니면 MR 2 | env 이름은 아직 답이 없다 |
