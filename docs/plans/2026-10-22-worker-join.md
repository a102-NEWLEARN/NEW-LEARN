# Jira S15P31A102-90 Lightsail 워커 join — common.sh · ufw-worker.sh · kubeadm join · 확인

## 무엇을 / 왜

받은 날 첫 확인(!84)으로 터널(wg0)까지 붙었다. 남은 것은 Lightsail 을 쿠버네티스 워커 노드로 붙이는 일이다. 붙어야 Argo CD(Jira 91) · 서비스 배포가 워커로 간다. 절차는 `infra/server/README.md` 「워커 붙이기」 2 · 6 · 7 · 8 과 「확인」 표.

## 지금 상태 (2026-10-22, 읽기만 해서 확인)

- Lightsail: wireguard-tools · wg0(10.200.0.2) 있음, handshake 됨. 쿠버네티스 · containerd 없음, ufw 22 만
- EC2 클러스터: 노드 1개(컨트롤 플레인, v1.36.5, taint `control-plane`), 커널 7.0.0-1014-aws 에서 Cilium 1.20.3 — Lightsail 커널도 7.0 이라 같은 계열
- Cilium 값 `devices: ens+,eth+,wg0`(Lightsail `ens5` 를 잡음), MTU 1420, VXLAN
- Deployment · StatefulSet(러너 · exporter · Grafana · Prometheus · operator · kube-state-metrics)은 모두 nodeSelector 로 컨트롤 플레인에 묶여 있다. 워커로 오는 것은 DaemonSet 셋(cilium · cilium-envoy · node-exporter)뿐. CoreDNS · cilium-operator 는 지금 Pod 가 그대로 남는다

## 작업 순서

1. [x] **Lightsail `common.sh`** — swap 끄기 · 커널 모듈 · IP 포워딩 · kubeadm/kubelet/kubectl 1.36.5 고정 · cri-tools · containerd 2.x. 걸린 시간을 잰다
2. [x] **Lightsail `ufw-worker.sh`** — 22 를 먼저 열고 80 · 443 · `allow in on wg0` · Pod 범위(10.244.0.0/16) 포워딩 → 켬. ufw 를 켤 때 SSH 가 끊길 수 있어 `nohup` 으로 돌리고 로그 파일로 결과를 본다. 80 · 443 은 이제부터 ufw 에서 열려 있다(듣는 것은 Jira 91 의 Envoy)
3. [x] **join**
   - EC2: `sudo kubeadm token create --ttl 30m --print-join-command` — 30분짜리 토큰. 출력은 화면 · 기록에 찍지 않고 변수로만 넘긴다
   - Lightsail: `sudo bash infra/server/join-worker.sh <찍힌 줄>` — 터널 · API 서버(10.200.0.1:6443) 확인 뒤 join
   - EC2: 쓴 토큰을 `kubeadm token delete` 로 바로 지운다
4. [x] **확인** (README 「확인」 표, 아래 「어떻게 검증하나」)
5. [x] **재부팅 확인** — Lightsail `sudo reboot` 한 번(사용자 선택). 다시 켜진 뒤 wg0 → kubelet 순서 · 노드 Ready · 공인 IP 그대로
6. [x] **기록**
   - 팀 문서(dev 에서 딴 `docs/infra/S15P31A102-90-worker-join` → dev MR, !84 와 같은 방식): `SSOT.md` 6절 「현재 상태」(노드 2개) · 10절 「잰 것」(join 시간 · Pod MTU · 노드 사이 지연), `infra/server/README.md` 「서버에서 확인 못 한 것」에서 확인한 것 빼기, 이 계획
   - Jira 90: 완료 기준 대조 댓글, MR 머지 뒤 완료
   - zoo_docs: status · cheatsheet · 결과 txt(토큰 · IP 가림)

## 바꿀 것

- Lightsail: swap · `/etc/sysctl.d/k8s.conf` · 모듈, 패키지(kubeadm · kubelet · kubectl · cri-tools 고정, containerd), ufw 규칙(22 · 80 · 443 · wg0 · Pod 포워딩), kubelet · containerd 서비스, `/etc/kubernetes/`
- 클러스터: 노드 1개 더함(워커), DaemonSet Pod 3개가 워커에 생김. 부트스트랩 토큰 1개(만들고 바로 지움)
- 팀 문서: `SSOT.md` 6 · 10절, `infra/server/README.md`, 이 계획 — dev 로 MR 하나

## 안 바꿀 것

- EC2 의 설정 · 컨트롤 플레인 · 기존 워크로드의 배치(nodeSelector) — 그대로
- Cilium · kube-prometheus-stack 값 파일, Argo CD · Envoy Gateway · 서비스 배포 — Jira 91
- DNS · 인증서 — Jira 93
- 보안 그룹 · Terraform(이미 51820/udp 열림), `.env` · 키 파일, GKE 컨텍스트

## 리스크

- ufw 를 켜는 순간 SSH 세션이 끊길 수 있다 → 22 를 먼저 열고, `nohup` 으로 돌려 끊겨도 끝까지 가게, 로그 파일로 확인. 끊기면 다시 붙어 본다
- join 토큰이 기록에 남을 수 있다 → 30분 TTL, 화면에 찍지 않고 변수로 넘기고, 쓴 뒤 바로 지움. 자동 기록 로그는 커밋 전에 검사
- join 이 실패할 수 있다(터널 · 인증서 · 판) → `join-worker.sh` 가 먼저 터널 · API 서버를 확인하고 멈춘다. 실패하면 `kubeadm reset` 뒤 원인을 보고 다시 승인받는다
- 워커의 Cilium 이 안 뜰 수 있다 → EC2 와 같은 커널 계열 · 같은 판이라 가능성은 낮음. 뜨지 않으면 워커를 빼고(되돌리는 법) 멈춘다
- 재부팅 뒤 kubelet 이 wg0 보다 먼저 떠 노드 주소를 못 찾을 수 있다 → `wg-up.sh` 가 kubelet 순서(drop-in)를 걸어 두었다. 그것을 실제로 보는 것이 5번
- Lightsail 은 버스트형(계속 쓸 수 있는 CPU 약 1.6)이다 — 지금은 DaemonSet 셋뿐이라 영향 없음

## 어떻게 검증하나 (Jira 90 완료 기준)

- `kubectl get nodes -o wide` (EC2): 노드 2개 Ready, INTERNAL-IP 10.200.0.1 · 10.200.0.2
- `cilium-dbg status --brief` (두 노드의 cilium Pod): `OK`. `KubeProxyReplacement` 줄에 `ens5` 와 `wg0`
- `kubectl -n kube-system get pods -o wide`: 전부 Running, 워커에 cilium · cilium-envoy
- 노드 사이 Pod: 워커에 묶은 busybox 로 `cat /sys/class/net/eth0/mtu` = 1370 · `nslookup kubernetes.default`(컨트롤 플레인의 CoreDNS 에 닿음) — 끝나면 지움
- 모니터링: Prometheus 에서 워커 node-exporter · kubelet 대상이 up (wg0 로 들어오는 것을 ufw 가 받는지)
- 재부팅 뒤: 위 줄들을 다시, `wg show` handshake, 공인 IP 그대로
- 토큰: `kubeadm token list` 에 남은 것 없음

## 되돌리는 법

- 워커 빼기: EC2 `kubectl drain <워커> --ignore-daemonsets` · `kubectl delete node <워커>`, Lightsail `sudo kubeadm reset -f`
- Lightsail ufw: `sudo ufw --force reset` 뒤 22 만 다시 열고 켬(또는 끔)
- 패키지 · swap: `apt-mark unhold` 뒤 `apt-get remove`, `/etc/fstab` 의 주석을 되돌림(지금 swap 줄이 없으면 할 것 없음)
- 되돌릴 수 없는 것: 없음


## 결과 (2026-10-22)

- 1 `common.sh`: 39초, 종료 0. kubeadm · kubelet · kubectl 1.36.5 · cri-tools 1.36.0 고정(hold), containerd 2.2.1. swap 은 원래 없었다
- 2 `ufw-worker.sh`: `nohup setsid` 로 띄워 로그로 확인. 22 · 80 · 443 · wg0 들임, Pod 범위만 포워딩. SSH 는 끊기지 않았다
- 3 join: 30분 토큰을 변수로만 넘김 → `join-worker.sh` 3초(「This node has joined the cluster」) → 토큰 지움, 남은 토큰 0. 노드 Ready 까지 11초
- 4 확인
  - 노드 2개 Ready, INTERNAL-IP 10.200.0.1 · 10.200.0.2, 두 노드 v1.36.5 · 커널 7.0 · containerd 2.2.1
  - Cilium 두 노드 `OK`, `KubeProxyReplacement` 에 `ens5` 와 `wg0 (Direct Routing)`, 클러스터 헬스 2/2(워커는 첫 검사 뒤)
  - 워커 Pod: 컨트롤 플레인 CoreDNS 로 이름 풀이, Grafana 호출, kube-state-metrics 311KB 받기, 인터넷(example.com) 200
  - Prometheus: 워커 kubelet 3 · node-exporter 1 대상 up
  - **계획과 다른 것**: Pod MTU 는 1420(두 노드 모두 lxc · cilium_vxlan · Pod eth0). 기대한 1370 이 아니다. 경로 MTU 도 없다. 큰 응답은 받히니 통신은 되지만 VXLAN 으로 감싸면 1470 이 되어 wg0(1420) 앞에서 쪼개지는 것으로 보인다 → 고치는 일은 Cilium 값이라 Jira 91 (`SSOT.md` 8절)
- 5 재부팅: SSH 17초, wg-quick@wg0 · kubelet 부팅 5초(kubelet 은 wg0 뒤 조건), 노드 마지막 신호가 새 부팅 뒤, 공인 IP 그대로, 워커 Pod 셋 한 번씩 다시 떠 Cilium 다시 OK. 「19초에 Ready」는 컨트롤 플레인이 NotReady 로 바꾸기 전의 값이라 신호 시각으로 다시 확인했다
