# 경보 보강 — Alertmanager 들어오는 길 정책 · 규칙 시험 CI · 경보/풀림 글 나누기 (Jira S15P31A102-139)

## 무엇을 / 왜

Jira S15P31A102-138 에서 켠 Mattermost 경보를 리뷰했을 때 남은 선택 제안 셋을 한 티켓으로 합니다(꼭 고칠 것은 !454 로 infra 에 머지됨, 3bb2c48).

- **정책:** Alertmanager API(9093)는 인증이 없습니다. 지금은 클러스터 안 어느 Pod 든(CI 잡 네임스페이스 `gitlab-runner` 포함) 닿습니다. 진짜 경보를 꺼 두거나(silence) `notify=mattermost` 가짜 경보를 팀 채널에 올릴 수 있습니다
- **시험:** !454 에서 고친 `for` · 대상별 `absent` 가 의도대로 도는지 확인하는 시험이 없습니다
- **글:** 한 묶음에 울리는 경보와 풀린 경보가 섞이면 풀린 것도 「🔴 경보」 아래 같이 나옵니다

**알아 둘 사실 (2026-10-30 서버에서 확인):**

| 무엇 | 값 |
|---|---|
| 판 | Prometheus v3.15.0 · Alertmanager v0.34.1 · 평가 · 수집 간격 30s |
| Alertmanager 에 붙는 것 | Prometheus — 경보 보내기 · 지표 수집(9093 `/metrics`, 설정 다시 읽기 곁 컨테이너 8080 `/metrics`). Grafana — 자료원 「Alertmanager」(9093) |
| 열린 포트 | 9093 · 8080. 9094(묶음 통신)는 `--cluster.listen-address=` 로 꺼져 있음 |
| 같은 노드 | Alertmanager · Prometheus · Grafana 모두 관리 서버. API 서버 프록시(`alerts.md` 확인 명령)는 관리 서버 호스트에서 와서 Cilium 기본값으로 열려 있음 |
| CI 이미지 | `w12:infra` 는 `hashicorp/terraform` (alpine) — promtool 이 없음 |

## 바꿀 파일

- `infra/k8s/alerts/alertmanager-netpol.yaml` (새) — CiliumNetworkPolicy `alertmanager-ingress`(`monitoring`)
  - 고르는 Pod: `app.kubernetes.io/name: alertmanager`
  - 받는 길: Prometheus(`app.kubernetes.io/name: prometheus`) → 9093 · 8080, Grafana(`app.kubernetes.io/name: grafana`) → 9093
  - 네임스페이스 이름표가 없으니 같은 `monitoring` 안의 Pod 만 맞습니다 — 다른 네임스페이스에서 이름표를 흉내 내도 못 들어옵니다
  - 주석 모양은 `infra/k8s/admin-ui/grafana-netpol.yaml` · `infra/k8s/gateway/ratelimit-netpol.yaml` 을 따릅니다(그대로 남는 길 · 이름표가 틀리면 무엇이 깨지나)
  - Argo CD 앱 `alerts` 가 반영합니다 — 손으로 `kubectl apply` 하지 않습니다
- `infra/ci/alert_rules.sh` (새) — `check` · `test` 두 가지
  - `rules.yaml` 의 `spec:` 아래를 두 칸 내어 임시 폴더에 꺼냅니다(`awk`). 첫 줄이 `groups:` 가 아니면 실패
  - `promtool check rules` · `promtool test rules` 를 그 임시 폴더에서 돌립니다
  - promtool 이 PATH 에 없을 때: CI(`$CI` 있음)면 GitHub 공식 릴리스 `prometheus-3.15.0.linux-amd64.tar.gz`(111MB)를 받아 sha256 을 확인하고 `/ci-cache/promtool/3.15.0/` 에 둡니다. 판 · sha256 은 이 파일 한 곳에만. 로컬이면 설치 안내(`docs/dev-environment.md`)를 내고 실패
- `infra/ci/alert_rules_test.yaml` (새) — promtool 단위 시험 넷. 시험마다 「아직 안 울림」 시각과 「울림」 시각을 같이 봅니다

  | 시험 | 넣는 값 | 보는 것 |
  |---|---|---|
  | 상한 풀림 수 첫 등장 | 풀림 수 줄이 10분 동안 없다가 1 로 나타남 | 2분(`for`) 전엔 안 울림 → 뒤엔 울림 → 10분 뒤 풀림 |
  | 수집 한 번 놓침 | 쌓인 풀림 수 5 에 끊김 표시(stale) 하나 | 10분 뒤 offset 쪽이 30초 비어도 `for: 2m` 덕에 안 울림 |
  | 수집 대상 하나만 사라짐 | Envoy 대상(`envoy-proxy-ratelimit`)만 끊김, 상한 서비스 대상은 그대로 | 5분 뒤 그 `job` 이름표로 울림 |
  | 백업 오래됨 | 매일 백업 마지막 성공이 그대로 / 주간 S3 마지막 성공이 그대로(다른 쪽은 늘 방금 성공) | 26시간 · 8일 + 10분(`for`) 전엔 안 울림 → 뒤엔 그 `cronjob` 으로 울림 |

- `.claude/stack.md` §3
  - `infra_LINT`: 셸 문법 검사에 `ci/*.sh` 를 더하고, 끝에 `bash ci/alert_rules.sh check`
  - `infra_TEST`: 끝에 `bash ci/alert_rules.sh test`
- `infra/k8s/bootstrap/monitoring-values.yaml`
  - `slack_configs` 의 `text` 를 `.Alerts.Firing` → (둘 다 있으면) 「✅ 풀림」 줄 → `.Alerts.Resolved` 순서로. `title` 은 그대로
  - 머리 주석에 「차트를 올리면 `infra/ci/alert_rules.sh` 의 promtool 판도」 한 줄
- 문서
  - `SSOT.md` 6절 모니터링 줄(166)에 정책 · 규칙 시험 · 글 나누기(정책도 Alertmanager 를 설명하는 이 줄 한 곳에 — 243 줄은 서비스 네임스페이스 정책이다. 「CI 검사 정책」 표는 잡 · 조건이 그대로라 안 바꿈). 10절에 실측
  - `infra/server/alerts.md`: 「확인」에 정책 줄, 「바꿀 때」에 「규칙을 바꾸면 `alert_rules_test.yaml` 도」 · 글 모양 검사(`amtool template render`)
  - `docs/dev-environment.md` 인프라 행: promtool 3.15.0
  - 이 계획: `docs/plans/2026-10-30-alert-hardening.md` 로 옮겨 커밋
- **관리자 PC (저장소 밖):** 로컬 커밋 게이트가 promtool 을 쓰므로 `promtool.exe` 3.15.0 을 `~/bin` 에 둡니다 — GitHub 공식 릴리스 `prometheus-3.15.0.windows-amd64.zip`(114MB), `sha256sums.txt` 로 확인 뒤 promtool 만 꺼냄

## 작업 순서 (누가)

작업은 `.claude/worktrees/S15P31A102-139` worktree(새 브랜치 `feat/infra/S15P31A102-139-alert-hardening`, `origin/infra` 3bb2c48 에서)에서 합니다 — 지금 폴더는 다른 세션과 같이 씁니다.

1. [x] **Claude** — 관리자 PC 에 promtool 3.15.0, 시험 파일 · 스크립트 · stack.md. 로컬 `check` · `test` 통과, 그리고 규칙을 일부러 망가뜨려(`for: 2m` 지움 등, 커밋 안 함) 해당 시험이 실패하는지. CI 받기 부분은 같은 terraform 이미지로 로컬 Docker 에서 돌려 봅니다 — 망가뜨림 다섯(상한 풀림 `for` 지움 · absent 하나로 합침 · `increase()` · 26→27시간 · 백업 `for` 지움) 모두 해당 시험이 실패. Docker(alpine 3.24.2): 빈 캐시 받기 + 검사 + 시험 48초, sha256 을 틀리게 하면 종료 1 · 캐시에 안 남음. 로컬 `pre-commit --ci infra` 통과 122초. reviewer 반영: 캐시의 promtool 도 매번 임시 폴더로 복사해 sha256 확인(바꿔치기한 캐시 → 다시 받아 되돌림 37초, 캐시 사용 10초), 로컬 판이 다르면 실패, 임시 이름은 `mktemp`, 상한 서비스 대상만 사라짐 시험 더함(그 absent 를 지우면 실패), alerts.md 의 `amtool template render` 에 `--template.glob`, 판 숫자는 스크립트 · dev-environment.md 에만
2. [x] **Claude** — 글 나누기. `helm template`(차트 92.10.1)로 그린 설정을 같은 판 `amtool check-config`, 그리고 `amtool template render` 에 섞인 묶음 데이터(울림 둘 · 풀림 하나)를 넣어 그린 글을 봅니다 — check-config SUCCESS. 섞인 묶음: 울림 둘 위 · 풀린 하나는 「✅ 풀림」 아래(옛 틀은 풀린 것이 울림 둘 사이에 섞임). 다 울림 · 다 풀림 묶음은 전과 같음
3. [x] **Claude** — 정책 파일. 시험 스크립트(지난 Jira 136 `np-test.sh` 모양)를 서버 `/tmp/am-np-test.sh` 로 올립니다 — 이름표마다 Pod 하나씩만 고름, 서버 dry-run 통과. 흉내 Pod 는 named 포트가 없어 `prometheus-operated` Service 에 안 끼고, Grafana 자료원은 operator 이름표까지 보는 Service 를 씀
4. [x] **사용자** — 반영 **전** 시험. 관리 서버 터미널에서 한 줄(끝에 「== 끝」이 찍힘)

   ```bash
   bash /tmp/am-np-test.sh
   ```

   시험 Pod 넷: `default`(워커 · 관리 서버) → 9093 · 8080 열림이어야 함. `monitoring` 의 이름표만 Prometheus · Grafana 인 Pod → 지금은 다 열림 — 2026-10-31 16:02:37 ~ 16:03:10 넷 모두 open
5. [x] **Claude** — MR → infra → dev. 파이프라인 success 뒤에만, 머지 직전 원격 dev SHA · 열린 MR 을 다시 봅니다. dev 반영 뒤 Argo CD 앱 `alerts` Synced · 정책 VALID 확인. 반영 동안 EC2 에서 1초마다 health — !460 → infra cb7e381, !461 → dev e243cd3(16:22:31), 정책 16:22:33 VALID. 보냄 오류 0 · 수집 up 1, health 600번 모두 200
6. [x] **사용자** — 반영 **뒤** 같은 한 줄. 기대: `default` → 둘 다 timed out, Prometheus 흉내 → 9093 · 8080 열림, Grafana 흉내 → 9093 열림 · 8080 timed out — 17:01:18 ~ 17:02:03 기대값 그대로
7. [x] **Claude** — 값 파일을 서버로 보냅니다(`infra/server/README.md` 「서버로 보내기」의 `tar … | ssh`). 막히면 사용자에게 한 줄 — `tar … | ssh` 로 보냄(막히지 않음)
8. [x] **사용자** — 관리 서버에서 늘 하던 업그레이드 한 줄

   ```bash
   helm upgrade --install kps oci://ghcr.io/prometheus-community/charts/kube-prometheus-stack --version 92.10.1 -n monitoring -f infra/k8s/bootstrap/monitoring-values.yaml --wait --timeout 10m
   ```

9. [x] **Claude** — 확인(아래) → 기록 MR(SSOT 10절 실측 · 체크박스) → infra → dev → 분야 브랜치 맞추기 → Jira 완료 — helm 10판 17:02:09, Alertmanager 다시 읽기 17:03:11 성공 · 재시작 0. 결과는 `SSOT.md` 10절 2026-10-31 세 줄

## 안 바꿀 것

- 경보 식(`rules.yaml`)은 바꾸지 않습니다. 시험이 식의 잘못을 드러내면 멈추고 알립니다
- `.gitlab-ci.yml` 은 고치지 않습니다 — 고치면 dev 에서 backend · frontend · ai 이미지를 다시 굽고 배포 태그 MR 이 열립니다(w4 · w5 의 `changes`). promtool 받기를 시험 스크립트 안에 둔 까닭입니다
- Alertmanager 자체 인증(web config) · Prometheus 들어오는 길 정책 · 나가는 길은 손대지 않습니다
- 다른 정책(`grafana-ingress` 등)과 차트 기본 경보 · 받는 길(`route`)은 그대로
- 「죽음 감지」(Watchdog 바깥 수신)는 이번에 하지 않습니다
- 채널에 시험 경보를 보내지 않습니다 — 글 모양은 `amtool template render` 로 봅니다

## 리스크

- **🔴 정책 이름표가 틀리면 경보가 소리 없이 끊깁니다.** Prometheus 가 Alertmanager 에 못 닿아도 그 사실을 알리는 기본 경보(`PrometheusNotConnectedToAlertmanagers` 등)는 받는 곳이 `null` 이라 채널에 안 옵니다. 그래서 반영 뒤 Prometheus 쪽 수치를 꼭 봅니다(아래 검증 2)
- **Grafana 이름표가 틀리면** Grafana 경보 화면의 Alertmanager 자료원만 안 열립니다. 사이트 · 경보와는 상관없음
- **promtool 받기:** CI 첫 잡은 111MB 를 받습니다. EC2 러너는 `/ci-cache`(관리 서버 디스크), 노트북 러너는 자기 캐시 볼륨에 남아 다음부터 받지 않습니다(리뷰에서 바로잡음). GitHub 가 안 되면 `w12:infra` 가 실패합니다
- **로컬 게이트:** 호스트에 promtool 이 없으면 infra 커밋이 막힙니다 — `docs/dev-environment.md` 에 적고, 지금 infra 를 커밋하는 사람은 사용자뿐입니다
- **판 어긋남:** 차트를 올려 Prometheus 판이 바뀌면 스크립트의 판도 같이 올려야 합니다(값 파일 머리 주석)
- **helm 업그레이드:** 글 틀이 틀리면 Alertmanager 가 새 설정을 거절하고 옛 설정을 씁니다. 미리 `amtool` 로 보고, 뒤에 실제로 읽은 설정을 확인합니다. Grafana Pod 가 다시 뜰 수 있습니다(사이트 영향 없음)

## 어떻게 검증하나

1. **규칙 시험**
   - 로컬: `bash ci/alert_rules.sh check` · `test` 통과. 일부러 망가뜨린 규칙에서 해당 시험이 실패
   - CI: `w12:infra` success, 로그에 promtool 받기 · `SUCCESS`. 첫 잡(받음)과 다음 잡(캐시)의 시간을 적습니다
2. **정책** (반영 뒤)
   - 시험 Pod: 위 작업 순서 6의 기대값
   - Prometheus → Alertmanager: `/api/v1/alertmanagers` 활성 1, `prometheus_notifications_sent_total` 이 늘고 `prometheus_notifications_errors_total` 은 그대로(늘 울리는 Watchdog 이 계속 보내짐), Alertmanager `alertmanager_alerts_received_total` 증가
   - 수집: `up{job="kps-kube-prometheus-stack-alertmanager"}` 두 대상(9093 · 8080) 모두 1
   - API 서버 프록시: `alerts.md` 의 `/api/v2/alerts/groups` 확인 명령이 그대로 답함
   - Argo CD 앱 `alerts` Synced · Healthy, `kubectl -n monitoring get cnp alertmanager-ingress` VALID
   - 반영 동안 EC2 health 실패 0
3. **글 나누기**
   - 반영 전: `amtool check-config` SUCCESS, `template render` 에서 울림 둘은 위에 · 풀린 하나는 「✅ 풀림」 아래에만
   - 반영 뒤: Alertmanager `/api/v2/status` 의 설정에 `.Alerts.Firing` 이 있음, Pod 재시작 0, 설정 다시 읽기 성공(`alertmanager_config_last_reload_successful` 1)
- **확인 못 하는 것:** 실제 Mattermost 화면에 그려진 섞인 글은 다음 실제 경보 때 봅니다(시험 경보를 채널에 안 보냄)

## 되돌리는 법

- **정책:** MR 을 되돌리면 Argo CD 가 지웁니다(`prune: true`). 급하면 Argo CD 화면에서 `alerts` 앱의 `alertmanager-ingress` 를 지우고 자동 맞추기를 잠시 끕니다 — 그냥 `kubectl delete` 하면 selfHeal 이 다시 만듭니다
- **규칙 시험:** stack.md 두 줄과 `infra/ci/` 두 파일을 되돌리는 커밋
- **글 나누기:** 값 파일을 되돌리고 helm 업그레이드를 한 번 더(사용자)
- 데이터 변경 · 외부 전송은 없습니다. 관리자 PC 의 `~/bin/promtool.exe` 는 지우면 그만입니다
