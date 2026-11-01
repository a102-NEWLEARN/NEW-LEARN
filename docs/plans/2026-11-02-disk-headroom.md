# 관리 서버 디스크 여유 · 계획 체크박스 정리 (2026-11-02)

## 무엇을 / 왜

2026-11-01 밤 점검에서 남은 인프라 일 가운데 혼자 할 수 있는 것을 처리한다(사용자 「전부 하자」). 사용자가 범위를 줄였다(2026-11-02).

- 운영은 발표(11-18)까지, 길어야 12월까지다. 그래서 **인증서 만료 경보**(만료 2027-01-20)와 **발표 뒤 상한 숫자 되돌리기**는 하지 않는다. 대신 SSOT 에 「안 하는 이유」를 남겨 8절 「못 정한 것」에서 지운다
- Jira 131 의 EC2 만 CI 측정은 하지 않는다(사용자: 생각만 해 두기)

### 디스크

관리 서버 루트 77%(29G). 하루 약 1.2%p 늘었고 그 대부분이 Prometheus 기록이다 — 블록이 하루에 2.91GB → 3.18GB, WAL 0.44GB, 가장 오래된 표본은 10-20 05:01 UTC. 두 노드 kubelet 의 실제 설정(`configz`)은 이미지 정리 85/80, 축출 `imagefs.available<15%`. 디스크가 하나라 **85% 에서 DiskPressure** 가 되어 이미지(CI 이미지 포함)부터 지우고, 그래도 넘치면 Pod 를 내쫓는다. 그동안 disk-pressure 테인트로 관리 서버의 CI 잡 · 백업이 못 뜬다. 그런데 지금 디스크 경보는 `> 0.85` · 10분이라 그 뒤에야 온다.

- 리뷰(2026-11-02)가 서버 값으로 다시 짚은 것: 3일 동안 1.18%p 가운데 Prometheus 몫은 약 0.93%p. 나머지(이미지 · CI 캐시 등으로 짐작 — 나눠 재지 않음)가 하루 0.25 ~ 0.74%p 더 는다 — 보존을 줄여도 11-12 ~ 11-30 사이에 다시 80% 에 닿을 수 있다. 경보가 그때 알리면 `infra/server/alerts.md` 대로 정리한다

사용자 결정(2026-11-02): Prometheus 보존 15일 → **7일**, 디스크 경보 **85% → 80%**, 안 쓰는 옛 이미지 넷 지우기. 7일이면 블록이 약 1.9GB(하루 0.27GB × 7)로 줄어 지금보다 약 1.2GB 덜 쓴다. 이미지까지 지우면 약 73% 에서 멈출 것으로 본다(반영 뒤 잰다).

### 체크박스

끝난 일인데 비어 있는 계획 문서 체크칸과 Jira 115 설명의 체크칸을 채운다.

## 바꿀 파일

- `infra/k8s/bootstrap/monitoring-values.yaml` — `retention: 15d` → `7d`, 왜 · 언제 바꿨는지 주석. `retentionSize: 8GB` 는 그대로
- `infra/k8s/alerts/rules.yaml` — `NewlearnDiskAlmostFull` 기준 `0.85` → `0.80`. 주석에 kubelet 85% 축출 · 이미지 정리 근거와 7일 보존 뒤 멈추는 자리
- `infra/ci/alert_rules_test.yaml` — 디스크 시험 추가: 79% 는 안 울림, 81% 는 10분 뒤 울림
- `SSOT.md`
  - 6절 모니터링: 「15일 · 8GB 보존」 → 「7일 · 8GB」
  - 6절 「도메인 · HTTPS」: 인증서 만료(2027-01-20)가 운영 기간 뒤라 만료 경보는 두지 않는다(사용자 2026-11-02)
  - 6절 「외부 입구」: 상한 숫자는 운영이 끝날 때까지 그대로 둔다
  - 8절: 「입구 상한 숫자를 발표 뒤 되돌릴지」 행 지움(정해짐)
  - 10절: 한 줄 — 잰 값 · 어떻게
- `infra/server/alerts.md` — 디스크 경보가 오면 볼 것(이미지 정리 방법 · 지우면 안 되는 이미지)
- `docs/plans/*.md` — 끝난 것이 증거로 확인된 체크칸만 `[x]`
  - 빈 칸 90개(25개 파일)를 조수가 증거(SSOT 10절 · 커밋 · 파일 · 반영 때 확인 기록)로 대조했다 — 끝남 79 · 미룸 3(AI 실제 모드 MR 2) · 모름 7 · 빠진 일 1(Grafana 정책 SSOT 10절 줄)
  - 끝남 79칸만 바꾸고, 나머지 11칸은 그대로 둔다
- 이 계획 파일 → `docs/plans/2026-11-02-disk-headroom.md` 로 이름을 바꿔 MR 에 넣는다
- Jira 115 설명 — MR 1 · 봉인 칸을 `[x]` 로
  - 근거: `eb744f2` MR 1 머지 · `ee5634e` 키 확인, 10-27 Secret `gms-api` 반영
  - MR 2 칸은 그대로

## 작업 순서

- [x] Jira 새 티켓(작업 · 스토리 포인트 2 · 라벨 infra newlearn-mvp) → 브랜치 `feat/infra/S15P31A102-141-disk-headroom`(Jira S15P31A102-141)(infra 에서)
- [x] 커밋 1 — 보존 7일 · 경보 80% · 디스크 시험
  - 확인: promtool check · test
  - 되돌림 확인: 옛 0.85 로 돌리면 새 시험이 실패하는지
- [x] 커밋 2 — 문서: SSOT 6 · 8절, alerts.md, 계획 체크칸, 이 계획 파일
- [ ] MR → infra → infra → dev
  - 머지 전마다 파이프라인 · 원격 확인
  - Argo CD 앱 `alerts` 가 규칙을 반영
- [ ] 사용자: helm upgrade(보존 7일) · 옛 이미지 지우기 — 명령은 파일 카드로
- [ ] 반영 확인 → SSOT 10절 한 줄 MR → 분야 브랜치 넷 맞추기 → Jira 완료 · Jira 115 설명 체크칸

## 사용자가 돌릴 명령

클러스터를 바꾸는 명령이라 자동 권한 검사가 막는다. 그래서 사용자가 돌린다.

1. **Prometheus 보존 바꾸기** — 관리 서버(EC2)에서. `infra/server/README.md` 「모니터링」과 같은 명령, 같은 차트 판:

   ```bash
   helm upgrade --install kps oci://ghcr.io/prometheus-community/charts/kube-prometheus-stack --version 92.10.1 -n monitoring -f infra/k8s/bootstrap/monitoring-values.yaml --wait --timeout 10m
   ```

2. **안 쓰는 옛 이미지 넷 지우기** — 관리 서버에서, 압축 크기 약 0.5GB. 어떤 컨테이너도 안 쓰고 CI · 매니페스트가 부르지 않는 것만 고랐다:

   ```bash
   sudo crictl rmi docker.io/nicolaka/netshoot:v0.16 docker.io/library/eclipse-temurin:25-jdk docker.io/library/node:26-alpine ghcr.io/astral-sh/uv:0.13.1-python3.14-trixie-slim
   ```

   - 지우지 않는 것: 다이제스트로 고정한 CI 이미지(node · uv · gradle · buildpack-deps · terraform · python · kaniko · redis · pgvector), pause, 러너 helper, webhook-certgen. CI 이미지는 잡이 끝나면 「안 씀」으로 보이지만 다음 잡이 다시 쓴다
   - `crictl rmi --prune` 은 위 이미지까지 지워서 쓰지 않는다. kubelet 문서도 바깥 정리 도구를 피하라고 한다

## 안 바꿀 것

- kubelet 설정(이미지 정리 85/80 · 축출선) — 노드 설정을 바꾸고 재시작하는 일이라 두지 않는다
- `retentionSize: 8GB` · PV 10Gi · EBS 크기
- 다른 경보 다섯의 식 · 받는 곳 · Alertmanager 설정. 인증서 만료 경보는 만들지 않는다
- 입구 상한 숫자(가입 100 · 로그인 300) — 글로만 「끝까지 둔다」
- Jira 131(EC2 만 CI 측정)
- 다른 사람 몫 계획에서 미룬 칸 · 증거 없는 칸

## 리스크

- 🔴 보존을 7일로 줄이면 7일보다 오래된 Prometheus 기록(10-26 무렵 이전)이 지워지고 되돌릴 수 없다. 그 무렵 잰 숫자는 SSOT 10절에 글로 남아 있다. Grafana 의 CI 병목 그래프도 최근 7일만 보인다
- helm upgrade 동안 Prometheus Pod 가 다시 뜬다. 그동안(1 ~ 2분) 수집이 비고 경보 평가도 쉰다. 사이트 · Alertmanager 는 영향이 없다
- 수집 대상이 늘면 멈추는 자리가 올라갈 수 있다. 80% 경보가 울리면 그때 원인을 보고 기준을 다시 정한다

## 어떻게 검증하나

- **로컬:** `bash infra/ci/alert_rules.sh check` · `test` 통과(새 디스크 시험 포함), 되돌림 확인, `/verify`(infra_LINT · infra_TEST)
- **반영 전:** 새 디스크 식을 Prometheus 에 그대로 물어 지금 값이 0.77(< 0.80, 안 울림)인지 본다
- **반영 뒤:** Argo CD `alerts` 가 Synced · Healthy, `/api/v1/rules` 의 `newlearn` 여섯이 `health: ok` · `inactive`
- **helm 뒤:**
  - Prometheus 인자가 `--storage.tsdb.retention.time=7d` 인지
  - `prometheus_tsdb_storage_blocks_bytes` · `prometheus_tsdb_lowest_timestamp_seconds` 의 전 · 뒤
  - `df -h /` 전 · 뒤
  - 반영하는 동안 EC2 에서 1초마다 health — 실패 0
- **이미지 지운 뒤:** `df -h /` · `crictl images` 수의 전 · 뒤
- reviewer 조수 · `/feature-done`

## 되돌리는 법

- **경보 규칙:** 이 MR 을 revert → Argo CD 가 옛 규칙으로 되돌린다
- **보존:** 값을 15d 로 돌리고 helm upgrade. 🔴 이미 지워진 기록은 돌아오지 않는다
- **지운 이미지:** 쓰는 곳이 생기면 그때 다시 받는다
