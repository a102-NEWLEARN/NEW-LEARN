# 경보 — Alertmanager → Mattermost

Alertmanager 가 우리 경보 여섯(`infra/k8s/alerts/rules.yaml`)만 Mattermost 「A102 배포알림」 채널로 보낸다. 차트 기본 경보는 평가만 하고 채널로는 안 보낸다 — 받는 길은 `infra/k8s/bootstrap/monitoring-values.yaml` 의 `alertmanager.config`. 왜 · 무엇을 고르나는 계획 `docs/plans/2026-10-30-alertmanager-mattermost.md`(Jira S15P31A102-138). 모니터링 설치는 `infra/server/README.md` 「모니터링」.

## 켜는 순서

1. **웹훅 주소 봉인** (관리자 PC 에서 — 주소를 물어 터미널이 붙어 있어야 한다). 배포 알림과 같은 「A102 배포알림」 채널의 들어오는 웹훅 주소를 넣는다. 채널에 연결 시험 글이 하나 올라간다

   ```bash
   ssh -t newlearn "bash infra/server/seal-secrets.sh alertmanager"
   ```

   주소를 Mattermost 에서 못 찾으면(들어오는 웹훅 목록에는 내가 만든 것만 보인다) 배포 알림 Secret 에 이미 있는 주소를 화면에 띄우지 않고 그대로 봉인한다 — 2026-10-30 이 방법으로 했다(채널 연결 시험 글은 안 씀)

   ```bash
   ssh newlearn "kubectl -n argocd get secret argocd-notifications-secret -o jsonpath='{.data.mattermost-url}' | base64 -d | kubectl create secret generic alertmanager-mattermost -n monitoring --from-file=url=/dev/stdin --dry-run=client -o yaml | kubeseal --controller-namespace sealed-secrets --format yaml > ~/sealed/sealed-alertmanager-mattermost.yaml && echo SEAL-DONE"
   ```

   ```bash
   ssh newlearn 'cat ~/sealed/sealed-alertmanager-mattermost.yaml' > infra/k8s/alerts/sealed-alertmanager-mattermost.yaml
   ```

2. **커밋 · MR** — Argo CD 앱 `alerts` 가 Secret `alertmanager-mattermost` 와 규칙을 만든다. Secret 이 먼저 있어야 Alertmanager Pod 가 뜬다(파일로 붙인다)

3. **Alertmanager 켜기** (EC2) — README 「모니터링」 「설치」의 `helm upgrade` 를 같은 판으로 한 번 더. Grafana Pod 가 한 번 다시 뜬다

## 확인 (EC2)

| 무엇을 | 명령 | 기대 |
|---|---|---|
| Pod | `kubectl -n monitoring get pod -l app.kubernetes.io/name=alertmanager` | Running, 재시작 0 |
| 이어짐 | `kubectl get --raw "/api/v1/namespaces/monitoring/services/kps-kube-prometheus-stack-prometheus:9090/proxy/api/v1/alertmanagers"` | `activeAlertmanagers` 하나 — 서비스 목록으로 채우는 값이라 실제로 닿는지는 아래 「보냄」으로 본다 |
| 규칙 | 같은 길의 `/api/v1/rules` | `newlearn` 묶음 여섯이 `health: ok` |
| 받는 곳 | `kubectl get --raw "/api/v1/namespaces/monitoring/services/kps-kube-prometheus-stack-alertmanager:9093/proxy/api/v2/alerts/groups"` | 기본 경보(Watchdog 등)는 `receiver.name` 이 `null` |
| 들어오는 길 정책 | `kubectl -n monitoring get cnp alertmanager-ingress` | `VALID` True |
| 보냄 | 「이어짐」과 같은 길의 `/api/v1/query?query=sum(increase(prometheus_notifications_errors_total%5B10m%5D))` · 같은 식의 `…_sent_total` | 오류 0 · 보냄 0 보다 큼(늘 울리는 Watchdog 도 보낸다) — 정책의 Prometheus 이름표가 틀리면 경보가 소리 없이 끊긴다(`infra/k8s/alerts/alertmanager-netpol.yaml`) |

## 디스크 경보가 오면 (`NewlearnDiskAlmostFull`, 80%)

80% 는 미리 알리는 선이다. kubelet 은 85% 에서 안 쓰는 이미지를 지우고, 같은 선에서 Pod 를 내쫓기 시작한다(이미지 정리 85/80 · 축출 `imagefs.available<15%`, 디스크가 하나라 같은 선 — 두 노드 `configz` 로 2026-11-02 확인). 관리 서버(EC2) 기준이다.

1. 큰 곳 — `df -h /` · `sudo du -xh --max-depth=2 /var/lib | sort -h | tail`. 평소에는 containerd(이미지) · `/var/lib/newlearn/prometheus`(보존 7일 · 8GB, `monitoring-values.yaml`) · `/var/lib/newlearn/ci-cache` 순이다
2. 이미지 — 어떤 컨테이너도 안 쓰고 CI · 매니페스트가 부르지 않는 것만 이름으로 지운다(`sudo crictl rmi <이름>`). 다이제스트로 고정한 CI 잡 이미지(`.gitlab-ci.yml` 의 node · uv · gradle · buildpack-deps · terraform · python · kaniko · services 의 redis · pgvector)는 잡이 끝나면 「안 씀」으로 보이지만 다음 잡이 다시 받는다. pause · 러너 helper · webhook-certgen 도 남긴다. `crictl rmi --prune` 은 이것들까지 지워 쓰지 않는다
3. Prometheus — `prometheus_tsdb_storage_blocks_bytes` 가 보존 안에서 멈춰 있나 본다. 수집 대상이 늘면 하루 증가분이 커진다

## 바꿀 때

- 경보 식을 바꿀 때는 먼저 Prometheus 에 그대로 물어 지금 값을 본다. 규칙만 바꾸면 MR 하나(Argo CD 가 반영)
- 식이나 주석(summary · description)을 바꾸면 단위 시험 `infra/ci/alert_rules_test.yaml` 도 같이 고친다. `infra/` 에서 `bash ci/alert_rules.sh test`(promtool 이 PATH 에 있어야 한다 — 판은 스크립트의 `PROM_VERSION`), CI `w12:infra` 도 같은 시험을 돈다
- 받는 길 · 글 모양(`monitoring-values.yaml`)을 바꾸면 「켜는 순서」 3 을 다시. 먼저 관리자 PC 에서 그린 설정을 같은 판 `amtool check-config` · `amtool config routes test` 로 본다. 글 틀은 `amtool template render --template.glob=<빈 .tmpl 파일> --template.text=<틀> --template.data=<경보 JSON>` 에 울림 · 풀림이 섞인 묶음을 넣어 그려 본다 — `--template.glob` 은 빈 파일이라도 꼭 준다(없으면 amtool 이 멈춤). JSON 모양은 Alertmanager `template.Data`
- Alertmanager API 를 새 Pod 에서 불러야 하면 `alertmanager-netpol.yaml` 에 그 길을 더한다 — 지금은 Prometheus · Grafana 만 받는다
- 🔴 웹훅 주소를 배포 알림(`argocd-notifications-secret`)과 같이 쓴다. 주소가 새면 Mattermost 에서 지우고 새로 만든 뒤 README 「GitLab 웹훅 · Mattermost 배포 알림」의 봉인과 「켜는 순서」 1 을 둘 다 다시 한다
- Alertmanager 가 죽으면 경보가 하나도 안 온다 — 늘 울리는 Watchdog 을 바깥에서 받는 「죽음 감지」는 아직 없다
- 🔴 끌 때 순서: 먼저 `monitoring-values.yaml` 의 `alertmanager.enabled: false` 로 helm upgrade → 그다음 규칙 · 봉인 Secret(Argo CD 앱 `alerts`) 제거. 거꾸로 하면 Secret 이 지워진 뒤 Alertmanager Pod 가 다시 뜰 때 ContainerCreating 에 멈춘다(Secret 을 필수 볼륨으로 붙임)
