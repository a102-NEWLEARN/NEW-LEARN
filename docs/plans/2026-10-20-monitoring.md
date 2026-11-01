# 모니터링 바탕 — Prometheus · Grafana 를 관리 서버에 (Jira S15P31A102-95)

## 무엇을 / 왜

테스트가 쌓이면 CI 가 느려진다(여신보좌관: 파이프라인 중앙값 약 11분 · 기다림 상위 10% 23분). CI 파이프라인(Jira 92)을 만들기 **전에** 병목을 잴 바탕을 깐다.
관리 서버(EC2)에 kube-prometheus-stack 을 올리고, Grafana 는 아이디 · 비밀번호 로그인 화면으로 본다. 지금은 Lightsail 이 없어 SSH 터널(kubectl port-forward)로 보고, 공개 주소 `newlearn.io.kr/grafana` 는 Lightsail · 정문 · HTTPS(Jira 90 · 91 · 93) 뒤에 연다(2026-10-20 사용자 결정). 추가 과금 없음 — CloudWatch 는 쓰지 않는다.

정한 것(사용자, 2026-10-20): 권고 B(EC2 기본 러너 + 노트북 큰 러너), Grafana GUI + 아이디 · 비밀번호, CloudWatch 제외, 학습 · 발표용이라 Grafana · Swagger 를 도메인으로 공개(HTTPS 뒤) — **Swagger 도 브라우저 팝업(아이디 · 비밀번호, HTTP 기본 인증)으로 막는다**(이번 범위 아님, Jira 93 · BE 에서).

## 바꿀 파일

- `infra/k8s/bootstrap/monitoring-values.yaml` (새) — kube-prometheus-stack **92.10.1**(operator v0.94.1) 값
  - 모든 구성요소를 관리 서버에: control-plane `NoSchedule` 견딤 + nodeSelector (operator · admission webhook 잡 · Prometheus · Grafana · kube-state-metrics · node-exporter)
  - CPU 예약을 작게(합계 약 250m 목표) — 지금 노드 예약 1000m + 모니터링 + CI 잡 550m ≤ 2000m
  - Alertmanager 끔(알림 받을 곳이 아직 없음). kubeadm · Cilium 구성에서 못 긁는 대상 끔: kube-proxy(없음 — Cilium 대체), etcd · controller-manager · scheduler(127.0.0.1 에만 열림) — 끈 대상의 기본 규칙도 끔
  - Prometheus: 보존 15일 · 8GB 상한, 수집 간격 30초, 메모리 요청 512Mi · 상한 1Gi, 다른 네임스페이스의 ServiceMonitor 도 읽게(`serviceMonitorSelectorNilUsesHelmValues: false`)
  - Prometheus 저장소: 정적 PV(hostPath `/var/lib/newlearn/prometheus`, 관리 서버 고정, 10Gi) — Pod 를 다시 띄워도 데이터가 남게. 프로비저너를 새로 깔지 않음
  - Grafana: 관리자 계정은 Secret `grafana-admin`(`admin-user` · `admin-password`)에서, 가입 · 익명 끔, 하위 경로 `serve_from_sub_path = true` · `root_url` 은 지금 `http://localhost:3000/grafana/`(공개할 때 `https://newlearn.io.kr/grafana/` 로 바꿈), 대시보드는 저장소에서(영속 저장소 없음), 기본 대시보드(노드 · Pod CPU · 스로틀) 켬
- `infra/k8s/bootstrap/prometheus-pv.yaml` (새) — 위 정적 PV
- `infra/k8s/bootstrap/gitlab-runner-values.yaml` — `metrics.enabled` · `metrics.serviceMonitor.enabled` · `service.enabled` 를 true (러너 지표 9252)
- `infra/server/README.md` — 「모니터링」 절: 저장 폴더 만들기(uid 1000 · gid 2000) → Grafana 관리자 Secret(사람이 `read -rsp`) → helm 설치 → 터널로 열기 → 확인 → 내리기
- `SSOT.md` — 6절(모니터링 구성 · 접속 · 공개 계획 · Swagger 기본 인증 방침), 10절(잰 자원 사용), 8절 변화 없음
- `docs/plans/2026-10-20-monitoring.md` — 이 계획을 날짜 이름으로 남김

## 작업 순서

- [x] 작업 브랜치 `chore/infra/S15P31A102-95-monitoring` (infra 에서)
- [x] 값 파일 · PV 작성 → 서버에서 `helm template` 렌더링: 모든 Pod 에 toleration · nodeSelector, 예약 합계, 끈 대상이 빠졌는지 (Secret 값은 템플릿에 없음)
- [x] 서버에 저장 폴더 생성, **Grafana 관리자 Secret 은 사용자가** 서버에서 `read -rsp` 로 입력(아이디 · 비밀번호 — Claude 는 보지 않음, 키 이름 · 길이만 확인)
- [x] `helm upgrade --install kps … --version 92.10.1 -n monitoring --wait` (CRD 포함)
- [x] 러너 `helm upgrade` 로 지표 켜기
- [x] 확인(아래) — 계획과 달랐던 것 셋: ① Prometheus Operator 는 StorageClass 가 실제로 있어야 해서 `prometheus-pv.yaml` 에 no-provisioner StorageClass 를 더함 ② 하위 경로 때문에 Grafana 자기 지표 수집이 실패 → `serviceMonitor.path: /grafana/metrics` ③ Grafana 메모리가 30분 최대 368.5MiB 라 상한 384Mi → 640Mi(요청 256Mi). 스로틀 지표는 `…_throttled_seconds_total` 을 차트가 버려서 `…_throttled_periods_total` 로 봄 → 10분 뒤 자원 사용을 Prometheus 로 재서 기록
- [x] 문서 · 커밋(게이트) → MR(→ infra) → 머지 직전 원격 확인 → Merge → Jira 95 완료 · dev · 분야 브랜치 반영은 따로 묻기
- [x] zoo_docs: learn(Prometheus · Grafana 구조 · 무엇을 보나), 캡처(Grafana 로그인 · 노드 · 스로틀 패널 — 계정 정보 가림), 화면 가이드 새 장, status · decisions

## 안 바꿀 것

- 공개(정문 · DNS · HTTPS) — Jira 90 · 91 · 93
- CloudWatch · AWS API 연동 (요금)
- gitlab-ci-pipelines-exporter · CI 병목 대시보드 — CI 파일(92)이 생긴 뒤 따로
- Alertmanager · 알림 채널 — Mattermost 웹훅 가능 여부 확인 뒤
- Argo CD 로 관리 — 91 뒤에 옮김
- Swagger 기본 인증 구현 — 93 · BE

## 리스크

- **관리 서버 자원:** 2 vCPU · 8GB 에 컨트롤 플레인 · 러너 · CI 잡과 같이 산다. 예약을 작게 잡고 설치 뒤 실제 사용을 재서 SSOT 10절에 남긴다. 예약 합계가 CI 잡 자리를 막으면 Prometheus 예약부터 줄인다
- **CPU 크레딧:** 수집(30초 간격)이 늘 CPU 를 조금 쓴다 — 설치 전후 CPU 사용률을 비교해 기록
- **hostPath PV:** 관리 서버 디스크에 묶임(노드를 옮기면 데이터는 남겨 두고 새로 시작). 폴더 소유자를 Prometheus(uid 1000 · gid 2000)로 맞춰야 쓰기가 된다
- **CRD 가 큼:** 설치 때 CRD 가 함께 들어감. 지울 때 helm 이 CRD 를 남기므로 따로 지움
- **하위 경로 · 터널:** `root_url` 이 실제 접속 주소와 다르면 로그인 뒤 엉뚱한 주소로 보낼 수 있음 — 지금은 터널 주소로 맞추고, 공개할 때 바꾼다

## 어떻게 검증하나

- `kubectl -n monitoring get pods -o wide` 전부 Running · 노드가 관리 서버, kube-system 9개 그대로, 노드 Ready
- 노드 CPU 예약 합계 + CI 잡 550m ≤ 2000m (`kubectl describe node`)
- 터널: 내 PC 에서 `kubectl -n monitoring port-forward svc/kps-grafana 3000:80` → `http://localhost:3000/grafana/login` 이 200, **사용자가 아이디 · 비밀번호로 로그인**
- Prometheus 대상: node-exporter · kubelet(cAdvisor) · kube-state-metrics · apiserver · CoreDNS · **GitLab Runner** 가 `up == 1`
- 쿼리: `gitlab_runner_concurrent` = 1, `container_cpu_cfs_throttled_seconds_total` 이 있음, 노드 CPU 사용률
- Prometheus Pod 를 지웠다 다시 띄워도 앞선 시점 데이터가 남음
- 설치 10분 뒤 모니터링 Pod 의 CPU · 메모리 사용(쿼리)과 노드 유휴를 기록
- 커밋 게이트 통과, MR 템플릿

## 되돌리는 법

- `helm uninstall kps -n monitoring` → `kubectl delete crd`(monitoring.coreos.com 계열) → `kubectl delete namespace monitoring` → PV 삭제 · `/var/lib/newlearn/prometheus` 지움
- 러너 지표: 값 되돌리고 `helm upgrade`
- 문서: MR 병합 커밋 Revert
- 되돌릴 수 없는 것: 없음 (외부 전송 · 과금 없음)
