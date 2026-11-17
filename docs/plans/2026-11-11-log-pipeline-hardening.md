# 로그 파이프라인 보강 — Alloy 책갈피를 서버 디스크에, 수집 도구도 지켜보기

## 무엇을 / 왜

카카오페이 기술 블로그 「로그 수집기가 왜 자꾸 OOM으로 죽었나」(Alloy · Loki 튜닝)를 기준으로 우리 로그 파이프라인을 운영에서 점검했다(2026-11-11). 그 글이 크게 고친 중복 수집은 우리에게 없다. Alloy 가 노드마다 자기 노드 Pod 로그 파일만 읽기 때문이다. 그러나 두 가지는 그대로 해당한다.

| 점검 항목 | 운영 값 (11-11) | 판단 |
|---|---|---|
| 읽은 위치(책갈피, `positions.yml`) | `/tmp/alloy` — 볼륨이 아니라 컨테이너 안이라 컨테이너가 다시 뜨면 사라진다 | 고칠 것 |
| 버린 로그 | 관리 서버 Alloy 가 「버림」으로 센 22,292줄(사유 `ingester_error`), 워커 0 — 400 을 받은 묶음 전체라 실제보다 크다. Loki 가 실제로 뺀 줄은 7일 넘은 옛 줄 5,516, 상한 초과 41,273번은 재시도로 들어갔다(설치 뒤 누적). 설치 날 옛 로그 파일을 처음부터 몰아 보낼 때 생긴 것으로 본다 — 지표를 모으지 않아 날짜별로는 못 나눈다 | 책갈피가 사라지면 몰아 보내기가 되풀이된다 |
| 수집 도구 자체 지표 | Prometheus 가 Alloy 를 모으지 않는다. 위 숫자도 손으로 curl 해서 알았다 | 고칠 것 |
| Alloy 가 죽거나 멈출 때 | 재시작 경보는 `app · ai · data` 만 본다. Alloy 가 멈춰도 경보가 없다 | 고칠 것 |
| Alloy 메모리 | 경보 식 그대로 워커 0.53 · 관리 서버 0.39(상한 256Mi), 7일 최대도 같다. Go 메모리 한도는 Alloy 가 시작할 때 상한의 90%(230.4MiB)로 스스로 건다(`go_gc_gomemlimit_bytes` 241,591,910) | 경보만 |
| 스트림 · 레이블 · DEBUG · 디스크 | 하루 스트림 57(상한 5,000), DEBUG 하루 7줄, 하루 78MB, 디스크 86MB / 5Gi | 문제없음 |

책갈피가 사라지면(컨테이너 재시작 · 값 변경 반영) 그 노드 로그를 처음부터 다시 보낸다(워커 37개 파일 · 75MB). Loki 는 받는 창 밖의 줄만 빼고 나머지는 저장하지만, 몰아 보내는 동안 상한(429)에 걸려 재시도하느라 새 로그가 늦게 들어가고, 재시도를 다 쓰면 실제로 빠진다. 새로 만드는 버린 로그 경보도 그때마다 크게 울린다. 11/12 저녁부터 15분 수집과 자동 분석이 켜져 로그가 늘기 전에 책갈피를 서버 디스크로 옮기고, 버린 로그 · 메모리 · 멈춤을 경보로 받는다.

## 바꿀 파일

| 파일 | 무엇을 |
|---|---|
| `infra/k8s/bootstrap/alloy-values.yaml` | `alloy.storagePath: /var/lib/alloy` + 호스트 `/var/lib/newlearn/alloy` 를 hostPath(`DirectoryOrCreate`)로 붙임(`controller.volumes.extra` · `alloy.mounts.extra`). 호스트 쪽 이름은 Loki PV 와 같은 관례 / `serviceMonitor.enabled: true` + 쓰는 지표만 남기는 `metricRelabelings`(`loki_write_dropped_entries_total` · `loki_write_sent_entries_total` · `loki_source_file_files_active_total` · `go_gc_gomemlimit_bytes` · `process_resident_memory_bytes` · `go_memstats_heap_inuse_bytes`). 수집 주기는 비워 전역 30초를 따른다 |
| `infra/k8s/alerts/rules.yaml` | 새 경보 셋 + 기존 하나 넓히기(아래 표). 머리 「일곱」 → 「열」 |
| `infra/ci/alert_rules_test.yaml` | 새 경보마다 「안 울림 · 울림」, 메모리 · 멈춤 경보는 kube-state-metrics 줄이 둘인 경우도 |
| 새 `infra/server/alloy-positions-seed.sh` | 한 번만 도는 책갈피 옮기기(EC2, 사람). 아래 「책갈피 옮기기」 |
| `infra/server/logging.md` | 3절 순서(책갈피 옮기기 → 30분 안에 `helm upgrade alloy`), 4절 확인, 6절 되돌리기 |
| `infra/server/alerts.md` | 3줄 · 33줄 「일곱」 → 「열」, 새 절 「로그 경보가 오면」(경보 description 이 이 절을 가리킴) |
| `infra/k8s/bootstrap/loki-values.yaml` | 머리 주석의 판을 「앱 판 3.6.16 · 이미지 3.6.11」로. 주석만이라 `helm upgrade loki` 는 하지 않는다 |
| `SSOT.md` | 6절 「모니터링」 Alertmanager 줄의 「일곱」 → 「열」, 로그 줄에 책갈피 hostPath · Alloy 지표 수집 · 자동 메모리 한도. 10절 잰 것(전 · 후) |
| 이 계획 파일 | `docs/plans/2026-11-11-log-pipeline-hardening.md` 로 옮김 |

**경보** — 식은 모두 11-11 Prometheus 에 그대로 물어 지금 값을 봤다

| 경보 | 식 (요지) | 지금 값 |
|---|---|---|
| NewlearnLogsDropped (새) | `sum by (pod, reason) (increase(loki_write_dropped_entries_total[10m])) > 0`. Alloy 는 시작할 때 사유 다섯 줄을 0 으로 만들어 두어 같은 Pod 안의 첫 증가는 `increase()` 로 놓치지 않는다(새 Pod 의 첫 수집 전 몫은 놓침) — 주석에 적는다. 이 수는 400 을 받은 묶음 전체라 실제로 빠진 줄보다 크다(alerts.md 에 사유별 뜻) | 지표를 아직 안 모음(반영 뒤 0) |
| NewlearnLogShipperMemoryHigh (새) | `max by (namespace, pod, container)` 로 양쪽을 접은 working set ÷ 상한(`container="alloy"`, `resource="memory"`) > 0.85, 15분. `on` 을 쓰지 않는 까닭은 rules.yaml 뉴스 수집 경보 주석과 같다 | 0.53 · 0.39 |
| NewlearnLogShipperDown (새) | 데몬셋 `desired - available > 0`(양쪽 `max by (namespace, daemonset)`) 또는 `up{namespace="monitoring", container="alloy"} == 0`, 10분 | 2 - 2 = 0 |
| NewlearnPodRestarting (넓힘) | 기존 식 `or` monitoring 의 `container=~"alloy\|loki"` 같은 조건 | 재시작 0 |

모든 새 경보에 `notify: mattermost`. 데몬셋 · 재시작 지표는 kube-state-metrics, 메모리는 cAdvisor 라 helm 반영 전에도 돈다.

**책갈피 옮기기 스크립트** — 노드마다 차례로

1. 그 노드 Alloy Pod(`spec.nodeName` 으로 짝짓기)에서 `/tmp/alloy/loki.source.file.pods/positions.yml` 을 `kubectl exec … cat` 으로 꺼낸다. `positions:` 로 시작하지 않으면 멈춘다
2. 그 노드에 임시 Pod(busybox, digest 고정, `nodeName` · 모든 테인트 허용)를 띄우고 호스트 `/var/lib/newlearn/alloy` 를 붙인다
3. `loki.source.file.pods/` 하위 폴더까지 만들어 넣는다(맨 위에 두면 Alloy 가 못 찾아 처음부터 다시 읽는다)
4. 원본과 사본의 sha256 이 같을 때만 그 노드를 통과시키고 임시 Pod 를 지운다
5. 두 노드 모두 통과하면 「책갈피 옮김 끝 — HH:MM 까지 helm upgrade alloy」(첫 노드를 꺼낸 때 + 30분)를 찍는다. 하나라도 실패하거나 Pod 가 있는 노드 수가 데몬셋 노드 수와 다르면 끝 표시 없이 종료 1. `DRY_RUN=1` 은 꺼내기와 임시 Pod 서버 검사만

## 작업 순서

- [x] Jira S15P31A102-192(작업, 스토리 포인트 3) · 브랜치 `feat/infra/S15P31A102-192-log-pipeline` · 계획 파일 옮기기
- [x] 경보 시험 먼저(규칙 없이 「울림」 기대가 빨개지는지) → 규칙 → infra 린트 · 시험
- [x] 값 · 스크립트 · 문서 — EC2 에서 `helm upgrade alloy … --dry-run=server` 출력과 `helm get manifest alloy` 를 견줘 볼륨 · 마운트 · 인자 · ServiceMonitor 만 바뀌는지, `bash -n`
- [x] reviewer 조수 → MR → infra → dev → 분야 브랜치 맞추기. 경보 규칙은 Argo CD `alerts` 앱이 반영
- [x] 바뀐 파일을 서버 `~/infra/` 로 보냄 → 사람(EC2): 지표 수집만 먼저 켬 — 저장 경로 · 볼륨은 지금 그대로 두는 덮어쓰기 값을 더해 `helm upgrade alloy`(데몬셋이 안 바뀌어 Pod 가 다시 뜨지 않음, dry-run 으로 확인). 덮어쓰기 값은 저장소에 넣지 않는다
- [x] 개선 전 재현(사용자 결정 11-11, 발표 재료): 사람이 워커 Alloy Pod 하나를 지움 → 다시 보낸 줄 · Loki 거절 · 새 로그가 Loki 에 닿기까지 걸린 시간 · Alloy 메모리를 잰다. 버린 로그 경보가 실제로 한 번 간다
- [x] 사람(EC2): 책갈피 스크립트 → 끝 표시의 마감 시각 안에 `helm upgrade alloy`
- [x] 개선 후: 같은 방법으로 워커 Alloy Pod 를 다시 지워 같은 값을 잰다
- [x] 확인 · 기록(SSOT 10절) · Jira 완료

## 안 바꿀 것

- Alloy 수집 설정(`alloy.configMap.content`) — 책갈피 키가 「파일 경로 + 대상 이름표」라서 이름표가 바뀌면 옮긴 책갈피가 맞지 않는다
- 레이블(`pod` · `filename` 등) — 하루 스트림 57개라 Structured Metadata 로 옮길 까닭이 없다
- Loki 값 · Pod — 상한(초당 4MB) · 보관 14일 · 한 프로세스 · 메모리 상한 512Mi 그대로. Loki ServiceMonitor 도 켜지 않는다(경보는 모두 Alloy 쪽 지표로 본다)
- Alloy 메모리 상한 256Mi, `GOMEMLIMIT` 환경변수(이미 자동으로 걸림)
- CI 병목 대시보드 · 수집기

## 리스크

| 무엇이 | 어떻게 막나 |
|---|---|
| 한 노드에서 책갈피 옮기기가 실패한 채 helm 을 치면, 그 노드가 처음부터 다시 보내 새 로그가 늦어지고 경보가 울린다 | 끝 표시는 두 노드 sha256 이 모두 맞을 때만. 사람 몫 안내에 「끝 표시가 없으면 helm 을 치지 않는다」 |
| 옮긴 뒤 helm 까지 1시간을 넘기면 다시 보낸 줄이 Loki 받는 창(스트림 최고 시각 - 1시간) 밖이라 400 으로 거절된다. 새 줄은 들어가지만 Alloy 가 그 묶음을 버림으로 세어 경보가 거짓으로 울린다 | 끝 표시에 「첫 노드를 꺼낸 때 + 30분」 마감 시각을 찍고, 지났으면 스크립트 다시 |
| 옮긴 시점 ~ 새 Pod 가 뜰 때까지의 줄을 한 번 더 보낸다 | 대부분 Loki 가 거른다(같은 시각 · 같은 줄). 많이 찍는 스트림은 몇십 초 분량이 두 번 보일 수 있다 |
| 값이 바뀌면 Alloy 가 노드마다 하나씩 다시 뜬다(`maxUnavailable` 1) | 그 사이 줄은 새 Pod 가 책갈피부터 이어 읽는다. 멈춤 경보는 10분이라 울리지 않는다 |
| 지표를 모으면 Prometheus 시계열이 는다(보관 8GB) | 쓰는 지표만 남긴다(Pod 하나에 약 400줄 → 10여 줄). 반영 뒤 `count({job=~".*alloy.*"})` 로 잰다 |
| 새 경보가 거짓으로 울림 | promtool 시험 + 지금 값(위 표). kube-state-metrics Pod 가 바뀌는 동안 줄이 둘이 되는 경우는 `max by` 로 접는다 |
| 경보 규칙이 helm 보다 먼저 반영된다 | 버린 로그 경보는 지표가 없어 조용할 뿐 거짓으로 울리지 않는다. `absent()` 는 쓰지 않는다 |
| 한계 — Pod 는 준비됐는데 수집 대상만 사라지면(ServiceMonitor 를 지움) 버린 로그 경보가 조용해진다 | job 이름을 반영 전에 확정할 수 없어 `absent()` 를 넣지 않는다. 규칙 주석에 적는다 |
| 한계 — Loki 자체가 멈추면 Alloy 가 재시도를 다 쓴 뒤에야(몇 분) 버린 로그 경보로 보인다 | 규칙 주석과 alerts.md 에 적는다 |

## 어떻게 검증하나

- **시험**: infra 린트 · 시험(`.claude/stack.md` §3). 경보 시험은 규칙을 빼면 단언에서 빨개지고, 넣으면 초록
- **펼침**: EC2 에서 `--dry-run=server` 와 `helm get manifest` 비교 — 데몬셋에 `--storage.path=/var/lib/alloy` · hostPath · 마운트, ServiceMonitor 하나. ConfigMap 은 그대로
- **반영 뒤 (운영)**
  - 두 노드 Alloy Pod 안 `/var/lib/alloy/loki.source.file.pods/positions.yml` 이 있고 수정 시각이 계속 바뀐다. 책갈피 이름표의 `node` 가 그 Pod 의 노드와 같다
  - 다시 읽기가 없었다: Loki `loki_discarded_samples_total` 사유별 원래 값이 반영 전(상한 초과 41,273 · 너무 오래됨 5,516)과 같고 새 사유(`too_far_behind`)가 없다. Alloy 버린 로그 다섯 사유 모두 0
  - Prometheus 수집 대상에 Alloy 둘이 up, `newlearn` 묶음 열 규칙이 `health: ok`, 새 경보는 inactive
  - 책갈피가 남는지 직접: 사람이 Alloy Pod 하나를 지우게 하고, 새 Pod 가 뜬 뒤에도 위 두 값이 그대로인지
  - Alloy 메모리 · CPU 를 반영 전과 견준다

## 되돌리는 법

1. 경보만: MR 되돌리기(Argo CD 가 규칙을 지운다)
2. 지표만: 값에서 `serviceMonitor.enabled: false` 로 `helm upgrade` — 책갈피 자리는 그대로 둔다
3. 전부: `helm rollback alloy 1`. 책갈피가 다시 `/tmp` 로 가서 노드마다 한 번 처음부터 다시 보낸다. ServiceMonitor 도 지워져 경보로는 안 보인다. 로그가 적은 새벽에 한다
- 호스트의 `/var/lib/newlearn/alloy` 는 남아도 해가 없다

## 검토 뒤 바뀐 것 (reviewer 조수, 11-11)

- Go 메모리 한도 환경변수를 뺐다 — Alloy 가 이미 자동으로 230.4MiB 를 건다(운영 지표로 확인)
- 메모리 경보를 `on` 짝짓기에서 `max by` 접기로, `container` · `resource` 조건을 넣었다
- 수집이 끊기면 조용한 문제 때문에 멈춤 경보를 더하고 재시작 경보에 Alloy · Loki 를 넣었다
- Loki ServiceMonitor 와 `helm upgrade loki` 를 범위에서 뺐다 — 경보가 Loki 지표를 쓰지 않는다
- 「일곱」이 적힌 곳을 넷(rules.yaml · alerts.md 두 곳 · SSOT 6절)으로 바로잡았다
- 스크립트에 노드 짝짓기 · 하위 폴더 · sha256 · 30분 시한, 리스크에 1시간 받는 창 · 중복 거르기의 한계를 넣었다
- 펼침 확인을 `helm template` 에서 `--dry-run=server` 비교로 바꿨다
- 호스트 경로를 `/var/lib/newlearn/alloy` 로(서버 데이터 관례)
- 버린 22,292줄의 사유를 상한이 아니라 `ingester_error` 로 바로잡았다

## 구현 중 바뀐 것 (11-11)

- 2차 검토(reviewer 조수): 「Loki 가 400 을 주면 같은 묶음의 새 줄까지 버려진다」는 Loki 코드와 달랐다. Loki 는 받을 수 있는 줄은 저장하고 받는 창 밖의 줄만 빼며, Alloy 가 400 을 받은 묶음 전체를 「버림」으로 센다. 문제는 손실보다 몰아 보내기에 따른 지연 · 재시도 소진 · 경보 소음이다 — 문서 · 주석 · 경보 문구를 고쳤다
- 되돌리기의 「버린 로그 경보가 온다」를 지웠다 — 판째 되돌리면 ServiceMonitor 도 지워지고, 새 Pod 의 첫 수집 전 몫은 `increase()` 가 놓친다
- 책갈피 스크립트: 노드가 모두 다른지 · 데몬셋 노드 수 > 0 확인, 임시 Pod 바로 지우기, 마감 시각 표시, `DRY_RUN` 은 0 · 1 만
- 발표 재료로 개선 전 · 후를 같은 방법(워커 Alloy Pod 지우기)으로 재기로 했다(사용자 결정). 지표 수집만 먼저 켜 개선 전 실험도 Prometheus 에 남긴다. 「새 로그가 Loki 에 닿기까지 걸린 시간」을 같이 잰다
- 개선 전 실험(워커 Alloy Pod 지움, 14:22:49)에서 버린 로그 경보가 울리지 않았다 — 다시 보내기가 15초 안에 끝나 새 Pod 의 첫 수집 값이 이미 123,167 이었고 `increase()` 는 0. 「지금 0 이 아닌데 10분 전에는 그 줄이 없었다」 갈래를 더했다(시험 「새 Pod 가 첫 수집 전에 버림」)
- 반영(helm 판 3) 때 새 줄이 없는 파일이 한 번 다시 읽혔다 — 돌아가는 Pod 에서 뜬 책갈피는 그런 파일의 위치가 첫 줄에 머물러 있다(Alloy 는 줄을 읽을 때 10초에 한 번만 적고 정상 종료 때 마지막 위치를 씀). 개선 후 실험에서는 0
- 결과: 개선 전 다시 보낸 줄 136,313 · Loki 거절 117,907 · 「버림」 123,167 → 개선 후 171 · 0 · 0. 우리 규모에서는 다시 보내기가 Loki 상한 아래라 새 로그 지연 · 실제 손실은 없었다(SSOT 10절 2026-11-11)
- 반영 15분 뒤 메모리 경보가 관리 서버 Alloy 에서 울렸다(working set 0.88). anon 65.8MiB(0.26) · 파일 캐시 158MiB(실행 파일을 메모리에 올린 것 121.8MiB)라 거짓 경보 — RSS 로 바꿨다(7일 최대 0.24 ~ 0.29)
