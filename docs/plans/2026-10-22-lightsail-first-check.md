# Lightsail 받는 날 첫 확인 — 접속 기록 · 80 · 443 · WireGuard UDP 응답 · 고정 IP (Jira 90 앞부분)

## 무엇을 / 왜

SSAFY 가 2026-10-22 Lightsail(워커, ssh 별칭 `new`)을 줬다. 워커를 클러스터에 붙이기(Jira 90) 전에 `SSOT.md` 8절 「Lightsail 받는 날 첫 확인」 세 가지와 hostPort 80 줄을 실제로 확인한다. 하나라도 막히면 join 하지 않고 대안을 다시 정한다(`docs/plans/2026-10-20-pre-server-infra.md` :50 · :56).

첫 접속 배너에 사용자보다 앞선 로그인(10-22 09:58 KST, 다른 IP)이 있어 접속 기록을 맨 먼저 본다.

## 지금 상태 (2026-10-22, 읽기만 해서 확인)

- Lightsail: Ubuntu 24.04.4 · CPU 4 · 메모리 15GiB · 디스크 309GB, `sudo` 비밀번호 없음, ufw 켜짐 · 22 만 허용, WireGuard · 쿠버네티스 · containerd 없음, 메타데이터로 공인 IP 를 읽을 수 있음, 공인 쪽 인터페이스 `ens5`
- EC2 보안 그룹: 51820/udp 는 `worker_cidrs` 의 출발지만 연다(`infra/terraform/network.tf` :34-43). 지금은 비어 있어 아무도 못 들어온다 → apply 가 있어야 UDP 확인이 된다
- 절차: `infra/server/README.md` 「워커 붙이기」 1 ~ 8. 이번에는 5(handshake 확인)까지만 한다

## 작업 순서

### 1. 접속 기록 (읽기만)

Lightsail 에서 `last -a -n 20`, `sudo journalctl -u ssh --since 2026-10-21 | grep Accepted`, `~/.ssh/authorized_keys` 의 키 개수 · 지문(`ssh-keygen -lf`). 09:58 접속이 우리와 같은 키인지 본다.

- 판정: 같은 키 → SSAFY 준비 또는 같은 키를 받은 사람. **다른 키가 등록돼 있거나 모르는 사용자 · 비정상 접속이면 여기서 멈추고 알린다** — 그 뒤 단계는 하지 않는다
- 접속 IP 는 대화에만 보이고 기록 파일에는 적지 않는다

### 2. 80 · 443 이 바깥에서 열려 있나

SSAFY 쪽 방화벽(콘솔 없음)을 보는 일이다. 서버 안 ufw 는 우리가 열 수 있으니 잠깐 열고 확인 뒤 닫는다.

1. Lightsail: `sudo ufw allow 80/tcp` · `sudo ufw allow 443/tcp` (임시)
2. Lightsail: `python3 -m http.server` 를 80 · 443 에 하나씩 띄운다. `timeout 300` 으로 5분 뒤 저절로 꺼지게
3. 두 곳에서 부른다: 내 PC(`curl -m 5 http://<도메인>:80/` · `:443/`), EC2(바깥 인터넷 대표)
4. 서버를 끄고 `sudo ufw delete allow 80/tcp` · `443/tcp`, `sudo ufw status` 로 22 만 남았는지 확인

- 판정: 응답 200 → 열림 / 시간 초과 → SSAFY 방화벽이 막음(443 이면 SSAFY 에 열어 달라고 요청 — 사용자가) / 연결 거부 → 방화벽은 지났는데 듣는 프로그램이 없음(시험 실수)
- 443 은 TLS 없이 평문으로 부른다. 지금은 길이 열렸는지만 본다

### 3. WireGuard UDP 응답 (README 「워커 붙이기」 1 · 3 · 4 · 5)

UDP 를 따로 시험할 길이 없어(EC2 의 51820 은 wg0 가 쓰고, 보안 그룹은 그 포트만 연다) 실제 handshake 로 본다.

1. **apply (EC2 보안 그룹)**: 메인 작업 폴더의 `infra/terraform/terraform.tfvars`(커밋 안 함) `worker_cidrs` 에 Lightsail 공인 IP `/32` 를 넣는다 → `terraform plan` → **`1 to add, 0 to change, 0 to destroy` 이고 더하는 것이 51820/udp 규칙 하나일 때만** apply. 그 밖의 바뀜이 보이면 멈추고 보여 준다. 프로필 `newlearn-apply`
2. **보내기**: `infra/server` 를 tar 로 Lightsail 과 EC2 에 보낸다(README :22 방식, `terraform/` 은 안 보냄)
3. **Lightsail**: `sudo apt-get install -y wireguard-tools` 만 한다 — `common.sh`(swap 끄기 · 쿠버네티스 · containerd)는 join 하는 Jira 90 본작업에서
4. **Lightsail**: `sudo bash infra/server/wg-up.sh worker <EC2 공개키> <EC2 탄력적 IP>`. EC2 공개키는 EC2 의 `/etc/wireguard/wg0.pub`, 탄력적 IP 는 `terraform output`
5. **EC2**: `/etc/wireguard/wg0.conf` 를 `/etc/wireguard/wg0.conf.bak-20261022` 로 복사해 둔 뒤 `sudo bash infra/server/wg-up.sh control-plane <Lightsail 공개키>` — 떠 있는 wg0 를 내리지 않고 상대만 더한다(스크립트 :104-107)
6. **확인 (Lightsail)**: `sudo wg show wg0` 의 `latest handshake`, `ping -c 3 10.200.0.1`, `ping -c 2 -M do -s 1392 10.200.0.1`(MTU 1420)

- 판정: handshake 가 찍히고 ping 이 가면 → 돌아오는 UDP 가 Lightsail 방화벽을 지난다 ✓ / handshake 가 안 찍히면 → **멈춘다**. join 하지 않고 대안(Tailscale · Lightsail 한 대 구성, 계획 :50)을 다시 정한다
- 터널은 다음 Jira 90 본작업에 그대로 쓰므로 켜 둔다. Lightsail ufw 는 손대지 않는다 — 들어오는 UDP 를 따로 열지 않아도 Lightsail 이 먼저 보낸 것의 응답은 ufw 가 받는다(연결 추적). 안 되면 그것도 결과로 적는다

### 4. 고정 IP

서버 안에서는 판정할 수 없다(고정 IP 는 콘솔에서 붙이고, 재부팅으로는 IP 가 안 바뀐다).

- 지금 할 것: 메타데이터의 공인 IP 와 SSAFY 도메인 이름이 가리키는 IP 가 같은지 확인해 적는다
- 사용자 몫: SSAFY 에 「고정 IP 인가, 서버를 껐다 켜면 IP 가 바뀌나」를 묻는다
- 바뀌면 다시 맞출 곳: EC2 보안 그룹 `worker_cidrs`(apply), DNS(Jira 93), 80 · 443 입구. WireGuard 는 Lightsail 이 먼저 붙어서 EC2 가 새 주소를 handshake 로 알게 된다(설계 의도, 바뀌는 상황 실측은 못 함)

### 5. 기록

- 팀 문서(작업 브랜치 `docs/infra/S15P31A102-90-lightsail-first-check` → infra MR): `SSOT.md` 8절의 두 줄(첫 확인 · hostPort 80)을 결과로 바꾸고 정해진 것은 6절로, `infra/server/README.md` :342 「서버에서 확인 못 한 것」을 결과로(인터페이스 `ens5` 포함)
- Jira 90: 「진행 중」 + 확인 결과 댓글
- 이 계획을 `docs/plans/2026-10-22-lightsail-first-check.md` 로 같은 MR 에

## 바꿀 것

- EC2 보안 그룹: 51820/udp 규칙 1개 더함(Lightsail 공인 IP /32) — Terraform apply
- `infra/terraform/terraform.tfvars`(로컬, 커밋 안 함): `worker_cidrs` 한 줄
- Lightsail: `wireguard-tools` 설치, `/etc/wireguard/wg0.{key,pub,conf}`, `wg-quick@wg0` 켜짐, kubelet drop-in 디렉터리(스크립트가 만듦), 홈의 `infra/server` 사본. ufw 는 시험 뒤 원래대로(22 만)
- EC2: `/etc/wireguard/wg0.conf` 에 상대 하나 더함(백업 남김), 홈의 `infra/server` 사본 새로
- 팀 문서: `SSOT.md` 6 · 8절, `infra/server/README.md`, 이 계획 — infra 로 MR 하나

## 안 바꿀 것

- Lightsail 의 swap · sysctl · 쿠버네티스 · containerd(`common.sh`), `ufw-worker.sh`, kubeadm join — Jira 90 본작업
- Argo CD · Cilium 설정(`cilium-values.prod.yaml` 의 인터페이스 이름은 결과만 적고 고치지 않음) — Jira 91
- DNS · 인증서 · 443 입구 — Jira 93
- EC2 의 다른 설정 · 클러스터 리소스, GKE 컨텍스트, `.env` · 키 파일

## 리스크

- 09:58 접속이 우리 것이 아닐 수 있다 → 1번에서 먼저 보고, 이상하면 멈춘다
- apply 가 의도와 다른 것을 바꿀 수 있다 → plan 결과가 「규칙 하나 더함」일 때만 apply
- EC2 wg0 를 잘못 건드리면 API 서버(10.200.0.1)와 내 PC 의 kubectl 터널이 끊긴다 → 스크립트가 wg0 를 내리지 않는 길(syncconf)을 쓰고, 설정을 백업해 두고, 바꾼 뒤 `kubectl get nodes` 로 컨트롤 플레인이 그대로인지 본다
- 시험용 포트를 닫지 않고 둘 수 있다 → `timeout 300`, 마지막에 `ufw status` 로 22 만 남았는지 확인
- Lightsail 공인 IP 가 나중에 바뀌면 보안 그룹이 어긋난다 → 4번에서 SSAFY 에 확인, 바뀌면 apply 다시

## 어떻게 검증하나

- 1: 로그인 기록의 키 지문이 `authorized_keys` 의 키와 같은지
- 2: 내 PC · EC2 에서 80 · 443 응답 코드, 시험 뒤 `sudo ufw status` 가 22 만
- 3: Lightsail `wg show` 의 `latest handshake` 2분 안, `ping 10.200.0.1` 3/3, `-s 1392` 통과. EC2 `wg show` 에 Lightsail endpoint, `kubectl get nodes`(EC2) 가 바꾸기 전과 같음
- 4: 메타데이터 IP = 도메인 이름의 IP
- 기록: MR 파이프라인 통과, Jira 90 댓글

## 되돌리는 법

- 2: `timeout` 으로 서버가 꺼지고, `sudo ufw delete allow 80/tcp` · `443/tcp`
- 3 Lightsail: `sudo systemctl disable --now wg-quick@wg0`, `/etc/wireguard` 삭제, `sudo apt-get remove wireguard-tools`
- 3 EC2: `sudo cp /etc/wireguard/wg0.conf.bak-20261022 /etc/wireguard/wg0.conf` 뒤 `sudo bash -c 'wg syncconf wg0 <(wg-quick strip wg0)'` (wg0 를 내리지 않는다)
- 보안 그룹: `worker_cidrs` 를 비우고 apply
- 되돌릴 수 없는 것: 없음


## 결과 (2026-10-22)

- 1 접속 기록: 등록된 키는 SSAFY 가 준 `K15A102T`(RSA 2048) 하나, 로그인 계정은 `root` · `ubuntu` 뿐. 첫 로그인(09:58 KST)도 이 키로, 같은 SSAFY 망 대역에서 들어왔다 → 멈출 일 없음
- 2 80 · 443: 내 PC(SSAFY 망) · EC2(바깥 인터넷) 모두 200 — SSAFY 쪽 방화벽이 열려 있다. 시험 뒤 ufw 는 22 만, 듣는 80 · 443 없음
- 3 WireGuard: Terraform 상태 잠금이 10-20 의 plan 시험에서 남아 있어(같은 PC, `-var` 따옴표 시험이 오류로 끝남) `force-unlock` 으로 그 잠금만 풀었다. plan 이 `1 to add, 0 to change, 0 to destroy`(51820/udp 규칙 하나)라 apply. `wireguard-tools` 설치 → `wg-up.sh worker` → EC2 설정 백업(`wg0.conf.bak-20261022`) → `wg-up.sh control-plane`. handshake 맺힘, `ping 10.200.0.1` 3/3 약 1ms, 1392 통과 · 1393 「message too long」, EC2 컨트롤 플레인 `Ready` 그대로
- 4 고정 IP: 메타데이터 공인 IP = SSAFY 도메인이 가리키는 IP. 서버를 껐다 켜지 않기로 해서(2026-10-22 사용자) 고정인지는 묻지 않는다 — `SSOT.md` 6절 「현재 상태」
- 시험 중 실수: 시험 서버를 `pkill -f "python3 -m http.server"` 로 끄다 같은 글자가 든 원격 셸까지 끊겨 ufw 정리가 한 번 안 돌았다 → 다시 확인하고 지웠다
