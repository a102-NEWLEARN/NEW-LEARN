# Mattermost 경보 — Alertmanager 켜고 꼭 필요한 경보만 배포알림 채널로 (새 Jira)

## 무엇을 / 왜

지금은 문제가 생겨도 사람이 Grafana 를 열어 봐야 압니다. Alertmanager 가 꺼져 있어서입니다(`infra/k8s/bootstrap/monitoring-values.yaml:8-10`, `SSOT.md` 8절).
- 입구 상한 서비스가 죽으면 상한이 소리 없이 풀립니다(`SSOT.md` 6절)
- DB 백업 실패도 알림이 없습니다(`infra/server/db-backup.md:14`)

2026-10-30 사용자 결정:
- 받을 곳: Mattermost **「A102 배포알림」 채널에 같이**
- 범위: **꼭 필요한 것만**. Pod 재시작 · 서비스 내려감은 **서비스 전부**(app · ai · data)

**알아 둘 사실(2026-10-30 서버에서 확인):**
- 차트 기본 경보 규칙 29개가 이미 평가되고 있고, 지금 4개가 울리는 중입니다(Watchdog · Alertmanager 에 안 이어짐 · CPU · 메모리 예약 과다). 그냥 켜면 이것들이 다 날아갑니다. 그래서 **우리 규칙(`notify: mattermost` 표시)만 채널로 보내고 나머지는 버립니다**(`null` 받는 곳)
- 관리 서버 노드의 CPU 예약은 1330m / 2000m 입니다(CI 잡 550m 를 더하면 1880m). Alertmanager 는 10m 로 작게 둡니다
- 루트 디스크는 지금 73% 입니다(29G)
- 쓸 지표는 모두 있습니다: 백업 마지막 성공 시각, Deployment · StatefulSet 가용 수, 디스크, 상한 풀림 수, 수집 `up`

## 경보 여섯 (`notify: mattermost`)

| 이름 | 언제 울리나 | 기다림 |
|---|---|---|
| `NewlearnRateLimitFailOpen` 상한 풀림 | 10분 사이 `envoy_cluster_ratelimit_failure_mode_allowed` 나 `…_error` 가 늘었다. 쌓인 수 차이 `(sum(x) or vector(0)) - (sum(x offset 10m) or vector(0)) > 0` 으로 봅니다 — 처음 풀릴 때 줄이 새로 생겨 `increase()` 는 첫 묶음을 놓칩니다(`SSOT.md` 6절) | 바로 |
| `NewlearnRateLimitMetricsMissing` 상한 지표 끊김 | `up{namespace="envoy-gateway-system"} == 0` 또는 대상이 아예 없음(`absent`) — 이러면 위 경보를 믿을 수 없습니다 | 5분 |
| `NewlearnPodRestarting` 재시작 반복 | app · ai · data 컨테이너가 15분 안에 3번 이상 다시 떴다 | 바로 |
| `NewlearnServiceDown` 서비스 내려감 | app · ai Deployment 가용 0, 또는 data StatefulSet 준비 0 | 3분 |
| `NewlearnDiskAlmostFull` 디스크 | 노드 루트(`/`) 사용률 85% 넘음 | 10분 |
| `NewlearnBackupMissing` DB 백업 | 매일 백업 마지막 성공이 26시간 넘음(04:00 이 실패하면 다음 날 06:00), 주간 S3 는 8일 넘음 | 바로 |

백업은 「실패한 잡이 있다」(`kube_job_status_failed`)가 아니라 「마지막 성공이 오래됐다」로 봅니다. 실패한 잡은 기록으로 3개까지 남아 있어서, 다음 백업이 성공해도 경보가 계속 울리기 때문입니다. 성공 시각으로 보면 백업이 아예 안 돌았을 때도 잡히고, 다음 성공 때 저절로 풀립니다.

Alertmanager 설정은 아래와 같습니다.
- **묶음:** 경보 이름으로 묶습니다. 처음 30초를 기다렸다 보내고, 풀리면 「풀림」도 보냅니다. 계속 울리면 12시간마다 다시 알립니다
- **받는 곳:** Mattermost 들어오는 웹훅은 Slack 모양 글을 받아서 `slack_configs` 를 씁니다
- **웹훅 주소:** 파일(`api_url_file`)로만 읽습니다. 값 파일과 저장소에는 주소가 없습니다

## 바꿀 파일

- `infra/server/seal-secrets.sh`
  - 새 종류 `alertmanager`: 웹훅 주소를 묻고, 채널에 「Prometheus 경보를 이 채널로 보냅니다 (연결 시험)」을 쓴 뒤, `monitoring` 의 Secret `alertmanager-mattermost`(키 `url`)로 봉인합니다
  - 주소 확인 · 시험 글 부분은 기존 `mattermost` 와 함수 하나로 같이 씁니다
- `infra/k8s/bootstrap/monitoring-values.yaml` — `alertmanager.enabled: true` 와 아래 설정
  - 컨트롤 플레인 고정, 요청 10m · 32Mi, 상한 64Mi
  - `secrets: [alertmanager-mattermost]`, 디스크 없음
  - `config` 의 route · receivers
- `infra/k8s/alerts/rules.yaml`(새 파일) — PrometheusRule `newlearn-alerts`
  - 네임스페이스 `monitoring`, 이름표 `release: kps` — Prometheus 가 이 이름표로 규칙을 고릅니다
  - 위 경보 여섯, 한국어 `summary` · `description`
- `infra/k8s/alerts/sealed-alertmanager-mattermost.yaml`(새 파일) — 사용자가 봉인한 결과를 가져옵니다
- `infra/k8s/apps/templates/alerts.yaml`(새 파일) — Argo CD 앱 `alerts`(dev 의 `infra/k8s/alerts`)
  - sync-wave 2: Sealed Secrets(-1) 뒤
  - `SkipDryRunOnMissingResource`: PrometheusRule CRD 는 helm 으로 깐 모니터링 차트가 줍니다
- 문서
  - `SSOT.md` 6절 「모니터링」(166 · 253 · 259 · 287 줄의 「Alertmanager 꺼짐 · 사람이 본다」), 8절의 경보 줄(344), 10절 실측
  - `infra/server/README.md` 「모니터링」에 경보 켜는 순서
  - `infra/server/db-backup.md:14`
  - `infra/k8s/gateway/ratelimit-podmonitor.yaml:3` 주석
- Jira 새 티켓([INFRA], 2점)

## 작업 순서 (누가)

1. [x] **Claude** — 위 파일을 작업 브랜치(`origin/infra` 에서)에서 고칩니다 — 식 여섯 모두 지금 0줄(기준만 낮추면 서비스 5 · 디스크 0.73 · 백업 둘 · absent 를 고름), `helm template` 으로 그린 설정을 같은 판 `amtool check-config` SUCCESS, `config routes test` 로 우리 경보 → mattermost · Watchdog 등 → null. README 가 500줄이라 켜는 순서는 `infra/server/alerts.md` 로 뺌. 확인할 것:
   - 로컬 `helm template`(차트 92.10.1)로 Alertmanager 설정이 그려지는지
   - `{{ }}` 글 틀이 helm 에서 깨지지 않는지(`tplConfig` 기본값)
   - Secret 이 붙는 경로가 `api_url_file` 과 같은지
   - 규칙 식을 지금 Prometheus 에 물어 값이 맞는지(디스크 0.73 · 백업 9시간 등, 모두 「안 울림」)
2. [x] **Claude** — 고친 `infra/server` 를 서버로 보냅니다(README 27줄의 `tar … | ssh`). 자동 권한 검사가 막으면 사용자에게 한 줄을 드립니다
3. [x] **사용자** — 관리자 PC 에서 아래를 돌려 「A102 배포알림」 웹훅 주소를 한 번 더 넣습니다. 채널에 연결 시험 글이 하나 올라갑니다 — 주소를 Mattermost 목록에서 못 찾아(내가 만든 웹훅만 보임), 배포 알림 Secret 의 주소를 화면에 안 띄우고 그대로 봉인함(`infra/server/alerts.md`, 연결 시험 글 없음)

   ```bash
   ssh -t newlearn "bash infra/server/seal-secrets.sh alertmanager"
   ```

4. [ ] **Claude** — 봉인 파일을 가져와 커밋합니다(`ssh … cat ~/sealed/…`). MR → infra → dev, 파이프라인 success 뒤 머지합니다. Argo CD 가 Secret 과 규칙을 만들면 확인합니다: Secret 이 있는지, Prometheus `rules` 에 `newlearn` 묶음이 있는지(아직 Alertmanager 가 없어 보내지는 않음)
5. [ ] **사용자** — 값 파일을 서버로 보낸 뒤(Claude 가 보냄) 관리 서버에서 늘 하던 업그레이드를 돌립니다(Grafana Pod 가 한 번 다시 뜹니다)

   ```bash
   helm upgrade --install kps oci://ghcr.io/prometheus-community/charts/kube-prometheus-stack --version 92.10.1 -n monitoring -f infra/k8s/bootstrap/monitoring-values.yaml --wait --timeout 10m
   ```

6. [ ] **Claude** — 확인(아래 「어떻게 검증하나」) → 기록 · Jira

## 안 바꿀 것

- 차트 기본 경보 규칙 29개는 그대로 평가합니다. 채널로만 안 보냅니다(`null`). 우리 규칙 말고는 Mattermost 에 가지 않습니다
- 배포 알림(Argo CD Notifications) · 그 웹훅 Secret(`argocd-notifications-secret`)은 손대지 않습니다
- 모니터링은 계속 helm 으로 사람이 올립니다(Argo CD 로 옮기지 않음 — `SSOT.md` 6절 2026-10-22 결정). 규칙 · Secret 만 Argo CD 앱으로 둡니다
- 바깥에서 사이트를 두드려 보는 감시(blackbox)는 넣지 않습니다(CPU 자리가 없음)
- 경보가 오면 사람이 볼 대응 방법(런북)은 `description` 한두 줄까지만 씁니다
- Mattermost 봇은 쓰지 않습니다(웹훅 글쓴이는 만든 사람 이름에 BOT)

## 리스크

- **CPU:** 노드 예약 1330m 에 Alertmanager(설정을 다시 읽는 곁 컨테이너 포함 약 20m)를 더하면, CI 잡 550m 와 합쳐 약 1900m / 2000m 입니다. 자리가 없으면 Pod 가 Pending 이 됩니다 — 확인 1번에서 봅니다
- **웹훅 주소를 둘이 같이 씀:** 주소가 새면 배포 알림 · 경보 Secret 둘 다 다시 봉인해야 합니다(README 「바꿀 때」에 적음)
- **잘못 울림:**
  - 백업 성공 시각 지표가 사라지면(CronJob 이름이 바뀜) 경보도 조용해집니다 — 「없음」도 잡게 `absent` 를 같이 둡니다
  - 서비스 내려감 3분 · 디스크 10분 기다림은 교체 · 일시 튐을 거릅니다
  - 처음 며칠은 실제로 몇 번 오는지 보고 숫자를 고칩니다
- **Alertmanager 자체가 죽으면** 아무 경보도 안 옵니다. 늘 울리는 Watchdog 을 바깥 서비스로 받는 「죽음 감지」는 이번에 하지 않습니다(한계로 적음)
- **helm 업그레이드 때 Grafana 가 다시 뜹니다:** 잠깐 Grafana 화면이 안 열립니다. 사이트에는 영향 없음

## 어떻게 검증하나

- **켜기 전(작업 순서 1):**
  - `helm template` 결과에서 Alertmanager 설정 · Secret 경로 확인
  - 규칙 식 여섯을 지금 Prometheus 에 물어 모두 「안 울림」인 값인지
- **규칙 반영 뒤(작업 순서 4):** `kubectl -n monitoring get secret alertmanager-mattermost`, Prometheus `/api/v1/rules` 에서 `newlearn-alerts` 가 health ok 이고 경보 여섯이 inactive
- **Alertmanager 켠 뒤(작업 순서 5):**
  - Alertmanager Pod Running · 재시작 0
  - Prometheus `/api/v1/alertmanagers` 에 활성 1, 「Alertmanager 에 안 이어짐」 경보가 풀림
  - Alertmanager `/api/v2/alerts/groups` 에서 기본 경보(Watchdog · CPU · 메모리 예약)가 `null` 묶음에만 있음 → 채널에 안 감
  - **끝에서 끝까지:** Alertmanager API 에 시험 경보 하나(`NewlearnTest`, `notify=mattermost`, 2분 뒤 끝남)를 넣어 채널에 「🔴 경보」 → 「✅ 풀림」 두 글이 오는지 봅니다. 채널 글은 사용자가 확인합니다(Claude 는 채널을 읽지 못함)
- **사이트:** 업그레이드 동안 EC2 에서 1초마다 health 실패 0
- **확인 못 하는 것:** 경보 여섯이 실제 장애에서 울리는지는 장애를 일부러 내지 않는 한 못 봅니다. 대신 식의 지금 값과, 시험 경보로 「Prometheus → Alertmanager → 채널」 길을 봅니다

## 되돌리는 법

- **Alertmanager 끄기:** `monitoring-values.yaml` 의 `alertmanager.enabled` 를 false 로 바꾸고 helm 업그레이드를 다시 합니다(사용자). 규칙은 남아도 보낼 곳이 없어 조용합니다
- **규칙 · Secret 지우기:** MR 을 되돌리면 Argo CD 가 `alerts` 앱과 그 안의 것을 지웁니다(finalizer). 데이터 변경은 없습니다
- **채널에 연결 시험 글 · 시험 경보 글이 남습니다:** 지우려면 Mattermost 에서 손으로 지웁니다
