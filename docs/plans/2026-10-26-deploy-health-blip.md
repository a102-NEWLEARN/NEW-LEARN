# 배포 순간 사이트 health 5초 끊김 — 원인 가르기 (재현 · 계측)

## 무엇을 / 왜

워커에 새 Pod 가 생기는 배포 순간에 관리자 PC 의 `/actuator/health` 요청 하나가 5초 시간 초과로 끝나고, 그 요청은 Envoy 접근 로그에 없다(2026-10-23 08:44:02, 2026-10-26 11:32:22 KST).
읽기 전용으로 남은 기록을 다 봤지만 원인을 하나로 못 박지 못했다 — 그 시각을 가리키는 기록이 누적값뿐이거나 이미 지워졌다(Hubble 은 약 2분치).
그래서 ① 다음에 또 끊기면 시각을 맞출 수 있게 NIC 상한 카운터를 Prometheus 에 넣고 ② 원인 후보 셋을 가르는 재현을 한 번 한다. 고치는 일은 결과를 보고 따로 계획한다.

## 조사 결과 (2026-10-26, 읽기만 했다)

큰 출력은 공유 노트 `2026-10-26-deploy-health-blip-findings.md`.

**확인한 것**

| | 10-23 (창 23:44:02 ~ 07 UTC) | 10-26 (창 02:32:22 ~ 27 UTC) |
|---|---|---|
| 그 창의 Pod 일 | 옛 frontend 끝냄(23:44:03.6 Cilium endpoint 삭제), backend 컨테이너 시작 | ai Pod 생성(02:32:22.55 Cilium endpoint 생성), init 시작 |
| 그 창의 받기 | backend 이미지 65MB 를 23:43:49 ~ 23:44:04 동안 (30초 평균 2.8MB/s) | 모델 2.2GiB 를 02:32:22 ~ 50 동안 (30초 평균 27 → 40MB/s, 2만 ~ 3만 pps) |

- Envoy 설정이 바뀐 탓이 아니다 — 리스너 마지막 갱신은 10-25 15:10 UTC. 리스너 넘침 · 연결 전 시간 초과 0
- 워커 커널이 버린 것이 아니다 — softnet 버림 0, `IpInDiscards` 0, 호스트와 Envoy Pod 모두 `ListenOverflows` · `ListenDrops` · `TCPReqQFullDrop` 0, SYN 쿠키 0
- Cilium 버림 기록에 없다 — `cilium-dbg bpf metrics list` 의 버림은 정책 거부 28 · IPv6 2774 뿐(부팅 뒤 누적). 그 시각 ens5 프로그램을 다시 붙인 기록 없음(Pod 장치만). hostPort 서비스 ID 35 · 38 그대로
- systemd-networkd · ufw 쪽 변화 없음 — lxc 는 unmanaged, ens5 재설정 로그 없음. ufw 는 443 과 Pod 대역 전달을 허용, 그 창의 UFW BLOCK 은 다른 포트를 두드린 스캐너뿐
- **워커 NIC 앞(AWS)에서 패킷을 줄 세우거나 버린 적이 있다** — `ethtool -S ens5` 의 `bw_in_allowance_exceeded` 43,858 · `pps_allowance_exceeded` 101,658(부팅 10-22 03:39 UTC 뒤 누적). 쉬는 15분 동안은 그대로였다. AWS 문서는 이 수를 「인스턴스 상한을 넘어 queued or dropped 된 패킷 수」라고 쓴다

**추정 (확인 안 됨)**

1. 유력 — 큰 받기가 시작되는 순간 AWS 쪽 받기 대역 · 패킷 수 상한에 걸려, 같은 NIC 로 오던 관리자 PC 의 SYN 과 재전송까지 버려졌다. 10-26 은 잘 맞는다. 10-23 은 받기 양이 작아 덜 맞고, 10-23 ai 이미지 541MB 받기 · 굽기(14 ~ 26MB/s) 때는 5초 실패가 없었다
2. Pod 가 생기거나 지워지는 순간 워커 안(Cilium hostPort)이 잠깐 엉켰다. 두 창 모두 Cilium 이 노드 주소를 다시 계산한 줄이 있다. 다만 같은 줄이 실패 없는 순간에도 여러 번 나왔고 버림 기록이 없어 약하다
3. 관리자 PC 쪽 인터넷 길(10-25 에 1초 지연 원인으로 확인)과 우연히 겹쳤다. 5초 시간 초과는 다른 측정 수천 번에서 0번이었고 두 번 다 배포 순간이라 약하다

## 바꿀 파일

- `infra/k8s/bootstrap/monitoring-values.yaml` — `prometheus-node-exporter.extraArgs` 에 ethtool 수집을 켠다. 장치는 `^ens5$`, 지표는 `_allowance_exceeded$`(다섯 개)만. 두 노드 모두 ens5 다
- `docs/plans/2026-10-26-deploy-health-blip.md` — 이 계획(plan mode 파일 이름을 바꿔 둔다), 결과를 맨 아래에 붙인다
- 재현용 매니페스트 · 스크립트는 저장소에 넣지 않는다(스크래치패드, 끝나면 서버에서 지운다)

## 작업 순서

- [ ] Jira 작업 티켓을 만든다 — 상위 S15P31A102-27(개발 기반·검증), 포인트 2, 제목 「배포 순간 사이트 health 5초 끊김 원인 가르기」. 브랜치 `feat/infra/<키>-deploy-health-blip`
- [ ] ① ethtool 수집 — 값 파일 한 곳을 고치고 `helm upgrade` 를 `--dry-run` 으로 본 뒤 적용(`infra/server/README.md` 「모니터링」 3번과 같은 명령). 커밋 1 · MR → infra
  - 확인: `node_scrape_collector_success{collector="ethtool"}` 두 노드 1, `node_ethtool_bw_in_allowance_exceeded` 값이 `ethtool -S ens5` 와 같다
- [ ] ② 재현 · 계측 — 한 번에 약 25분. 그동안 관리자 PC 에서 0.2초마다 health 를 부른다. 아래 「재현 방법」
- [ ] ③ 결과를 Jira 티켓 댓글 · 이 계획 맨 아래 · 공유 노트에 남긴다. `SSOT.md` 10절 · 8절 반영은 메인 세션 몫으로 넘긴다(지금 메인 세션이 SSOT 를 고치는 중)

## 재현 방법 (② — 서버에 남는 것 없음)

**계측 (내내 켜 둔다)**

- 관리자 PC: 0.2초마다 `curl --max-time 5 https://newlearn.io.kr/actuator/health`, 줄마다 시각(ms) · 내 쪽 포트(`%{local_port}`) · 코드 · 연결 · TLS · 전체 시간. 시작 전 PC 시계 차이를 `w32tm /stripchart` 로 잰다
- 워커 ens5: `tcpdump` 로 443 에 오는 SYN 의 시각 · 보낸 포트만 파일에 쓴다. 관리자 PC 주소는 `$SSH_CONNECTION` 에서 읽어 거르는 데만 쓰고 화면 · 기록에 내지 않는다
- Envoy Pod 안(`nsenter`): 10443 에 오는 SYN 을 같은 방식으로
- 워커: `ethtool -S ens5` 의 상한 카운터 다섯 개를 1초마다 파일로
- Cilium: `cilium-dbg monitor --type drop` 을 워커 agent 에서 파일로

**순서 (구간마다 시작 · 끝 시각을 적는다)**

| 구간 | 하는 일 | 받기 | Pod 일 |
|---|---|---|---|
| R0 기준 | 아무것도 안 함 5분 | 없음 | 없음 |
| R1 Pod 만 | 새 네임스페이스 `blip-test` 에 `pause:3.10.2`(워커에 있음) Pod 를 만들고 지우기 10번, 30초 간격 | 없음 | 20번 |
| R2 받기만 | 같은 네임스페이스에 지금 ai 이미지(워커에 있음)로 Pod 를 띄우고 **20초 뒤** emptyDir 에 `hf download`(10-26 init 과 같은 모델 · 커밋). 2번 | 약 4.6GB 들어옴 | 받기와 20초 떨어짐 |
| R3 둘 다 | R2 와 같되 기다림 없이 바로 받기. 1번 | 약 2.3GB | 겹침 |

끝나면 `blip-test` 네임스페이스와 서버의 캡처 파일을 지우고, 공인 IP 를 가린 요약만 가져온다.

**판정 (실패 · 1초 넘긴 요청마다 그 포트로 찾는다)**

| ens5 에 SYN | Envoy Pod 에 SYN | 그 초 상한 카운터 | 판정 |
|---|---|---|---|
| 없음 | 없음 | 늘어남 | 추정 1 — AWS 상한 |
| 없음 | 없음 | 그대로 | 추정 3 — 바깥 길 |
| 있음 | 없음 | — | 추정 2 — 워커 안(Cilium · ufw), drop 기록과 맞춘다 |
| 있음 | 있음 | — | Envoy · TLS 쪽 — 새 가설 |

어느 구간에서도 실패가 없으면 「재현 안 됨」과 요청 수를 적고 멈춘다. 다음 배포 때 ① 의 시계열로 다시 본다.

**결과별 다음 일 (이 계획 밖 — 따로 계획해 승인받는다)**

- 추정 1: 큰 받기를 느리게 — 모델 받기 동시 수 줄이기, containerd 이미지 받기 동시 수 1. 또는 받아들이고 SSOT 에 한계로 적기
- 추정 2: Cilium 1.20.3 이슈 찾기 · 판 올리기 검토
- 추정 3: 서버 쪽 할 일 없음. 기록만

## 안 바꿀 것

- Cilium · Envoy Gateway · ufw · containerd · kubelet 설정과 판 — 원인이 정해진 뒤 따로
- 서비스 매니페스트(`infra/k8s/services/`), ai 의 PVC · init — R2 · R3 은 따로 띄운 시험 Pod 로만 받는다
- `SSOT.md` · `docs/api*.md` · `docs/data-model.md` — 메인 세션이 고치는 중
- GKE 컨텍스트, 비밀값

## 리스크

- ① `helm upgrade` 로 node-exporter DaemonSet 이 다시 뜬다 — Pod 2개 교체, 그동안 노드 지표 30초 안팎 빈칸. 다른 값은 그대로라 Prometheus · Grafana 는 안 바뀐다(dry-run diff 로 확인)
- ① ethtool 수집이 권한 때문에 실패할 수 있다(컨테이너는 읽기 전용 · 일반 사용자) — 그러면 `collector_success` 0 으로 보이고, 그 줄만 되돌린다
- ② 재현 중 사이트를 쓰는 팀원의 요청도 몇 번 끊길 수 있다(배포 때와 같은 정도). 시작 전에 팀에 알릴지는 사용자가 정한다
- ② R2 · R3 은 워커로 약 7GB 를 받는다 — 워커 디스크 286G 남음, emptyDir 상한 4Gi 로 막고 Pod 를 지우면 사라진다. 그동안 ai 와 굽기 잡의 받기가 느려질 수 있어 굽기가 없는 때에 한다
- ② tcpdump 는 SYN 만, 헤더만 잡는다(`-s 96`). 본문 · 쿠키는 안 잡힌다

## 어떻게 검증하나

- ①: 위 「확인」 두 줄, Prometheus 대상 node-exporter 두 개 up
- ②: 구간마다 요청 수 · 실패 수 · 1초 넘김 수, 실패 요청마다 위 판정표의 네 칸이 모두 채워졌는지. 재현 뒤 `kubectl get ns blip-test` 가 없음, 워커 캡처 파일 없음
- 판정 근거는 명령과 출력(공인 IP 가림)으로 Jira 댓글에 붙인다

## 되돌리는 법

- ①: 값 파일의 extraArgs 몇 줄을 지우고 같은 `helm upgrade`. 또는 `helm rollback kps <지금 리비전 5>`
- ②: 남기는 것이 없다. 도중에 멈출 때는 `kubectl delete ns blip-test` 와 워커의 tcpdump · ethtool 루프 `pkill`, 캡처 파일 삭제
