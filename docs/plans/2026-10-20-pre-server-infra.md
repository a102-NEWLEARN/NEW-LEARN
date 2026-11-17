# 서버 받기 전 인프라 준비 — 설계 반영 · S3 상태 파일 · 서버 스크립트 · EC2 생성

## 무엇을 / 왜

10/19에 정한 두 가지(Secret 은 Sealed Secrets, 노드 사이는 호스트 WireGuard)가 팀 문서와 Terraform 에 아직 들어가지 않았다. 지금 코드대로 apply 하면 쓰지 않을 포트가 열린다.
2026-10-20 사용자가 「EC2 는 준비가 끝나는 대로 만들고, Lightsail 은 받는 날 join 만」, 「상태 파일은 S3」로 정했다. SSAFY 승인 금액도 10/19~11/18 운영 기준이라 지금 띄워도 범위 안이다.
그래서 서버 없이 할 수 있는 것을 다 해 두고, EC2 를 만들어 컨트롤 플레인을 Cilium 까지 올린다. Lightsail 받는 날은 WireGuard 연결 · join · Argo CD 만 남긴다.

## 정한 설계 (구현 근거는 공식 문서로 확인함, 미확인은 따로 표시)

- **터널:** 10.200.0.0/24, EC2 10.200.0.1 · Lightsail 10.200.0.2, 51820/udp, 양쪽 `MTU = 1420` 고정. EC2 는 점보 프레임(9001)이라 자동값을 믿지 않는다. Lightsail 피어는 `Endpoint = <EC2 탄력적 IP>:51820`, `PersistentKeepalive = 25`. 개인키는 각 서버에서 만들고 밖으로 내지 않는다(공개키만 교환)
- **보안 그룹:** 워커용 6443 · 10250 · 4240 · 8472/udp 네 규칙을 없애고 `worker_cidrs`(Lightsail 공인 IP) 에서 오는 51820/udp 하나만 연다. 터널 안 쿠버네티스 트래픽은 보안 그룹이 보지 않는다. Lightsail 고정 IP 가 없으면 받는 날 「51820 만 전 세계에 열기」를 다시 정한다(WireGuard 는 인증 안 된 패킷에 응답하지 않음)
- **kubeadm:** 설정 파일(v1beta4)로. advertiseAddress · controlPlaneEndpoint 10.200.0.1:6443, `kubeletExtraArgs: [{name: node-ip, value: 10.200.0.1}]`, podSubnet 10.244.0.0/16, skipPhases addon/kube-proxy, apiServer certSANs 에 127.0.0.1(관리자 PC 에서 SSH 터널로 kubectl). kubelet 은 `wg-quick@wg0` 뒤에 뜨게 systemd 순서를 건다
- **Cilium:** 새 `cilium-values.prod.yaml` 에 `MTU: 1420`, `k8sServiceHost: 10.200.0.1`, `devices` 명시. 공통 값 파일은 그대로(kind 와 MTU 가 다름)
- **EC2 단독 기간:** kubeadm init → Cilium → CoreDNS Running 까지만. 컨트롤 플레인 taint 는 지우지 않는다(지우면 Argo CD 가 컨트롤 플레인에 남음). Argo CD 는 Lightsail join 뒤
- **S3 상태 파일:** 부분 백엔드 `backend "s3" {}` + 커밋 안 하는 `backend.hcl`(버킷 이름), `use_lockfile = true`(DynamoDB 없이 잠금). 버킷은 apply 키로 AWS CLI 한 번(버전 관리 · 퍼블릭 차단, 암호화는 S3 기본값). 커밋 게이트는 `-backend=false` 라 영향 없음
- **자격 증명:** S3 잠금 때문에 plan 도 쓰기 권한이 필요하다 → plan · apply 모두 새 apply 전용 키로 하고, 읽기 전용 키는 비활성화한다(미뤄 둔 할 일이 같이 끝남)

## 바꿀 파일

- `SSOT.md` 6절 — 보안 그룹 · Lightsail 방화벽 줄, 클러스터 네트워크(WireGuard · 터널 주소 · MTU), kubeadm 줄, 상태 파일 S3, 현재 상태. 8절 — 정해진 셋(Secret 방식 · 노드 사이 암호화 · 상태 파일 위치) 지우고, Lightsail 443 을 SSAFY 가 열어 줘야 하는지 · Lightsail 이 돌아오는 UDP 를 받아 주는지 · 고정 IP 를 올림. 9절 「뒤집은 것」 — Cilium 이 공인 IP 로 VXLAN → 호스트 WireGuard
- `infra/terraform/network.tf` · `variables.tf` · `tests/security_group.tftest.hcl` — 워커 규칙을 51820/udp 하나로, 테스트 단언도 「1개 · udp · 51820」
- `infra/terraform/versions.tf` · `backend.hcl.example`(새) · `infra/.gitignore` — S3 부분 백엔드
- `infra/terraform/iam/apply-policy.json`(새) — EC2(리전 조건) · Budgets(us-east-1 전역이라 리전 조건 없음) · S3 상태 버킷(`newlearn-tfstate-*` 만)
- `infra/server/`(새) — `common.sh`(swap · 모듈 · ip_forward · containerd 2.x SystemdCgroup · kubeadm/kubelet/kubectl 1.36 고정 hold · wireguard-tools), `wg-up.sh`(노드별 wg0), `init-control-plane.sh`, `join-worker.sh`, `ufw-worker.sh`(22 를 enable 보다 먼저 · 80/443 · wg0), `README.md`(EC2 순서 · 받는 날 순서 · 확인 명령)
- `infra/k8s/kubeadm/init.yaml` · `join.yaml`(새), `infra/k8s/bootstrap/cilium-values.prod.yaml`(새)
- `infra/README.md` — 「apply 는 아직 하지 않는다」를 apply 절차(S3 · apply 키)로
- `.claude/stack.md` — §3 `infra_LINT` 에 `server/*.sh` 문법 검사, §8 로컬 파일에 `backend.hcl` · apply 프로필
- 이 계획 파일 — 승인 뒤 `docs/plans/2026-10-20-pre-server-infra.md` 로 이름을 바꿔 첫 MR 에 넣는다

## 작업 순서 (Jira 티켓 · MR 단위, 각 MR 은 infra 대상으로 만들어 바로 머지)

- [x] **A. 설계 반영** (Jira 새 티켓) — SSOT · README 문구, 보안 그룹 · 테스트. 확인: `terraform fmt -check` · `validate` · `test`, `grep -n "8472\|4240" SSOT.md infra/` 에 옛 서술이 없음
- [x] **B. S3 상태 파일 · apply 권한** (Jira 새 티켓) — 부분 백엔드, 정책 JSON, gitignore, stack.md §8. 확인: 커밋 게이트 통과, `git check-ignore infra/terraform/backend.hcl`, `jq . apply-policy.json`
  - 사용자: IAM 콘솔에서 apply 전용 사용자 생성 · 정책 붙이기 · 키 발급 → `aws configure --profile newlearn-apply`. SSH 키(`ssh-keygen -t ed25519`) 만들고 `terraform.tfvars` 채우기
  - 나: apply 키로 버킷 생성(CLI), `terraform init -backend-config=backend.hcl`, plan 출력 보여 주기
- [x] **C. 서버 스크립트 · kubeadm · Cilium 값** (Jira 새 티켓, A 와 파일이 안 겹쳐 따로 진행 가능) — 확인: `bash -n`, kindest/node v1.36.4 이미지 안에서 `kubeadm config validate --config init.yaml`, `helm template` 으로 MTU · devices 반영, ubuntu:24.04 컨테이너에서 `common.sh` 의 패키지 설치 부분
- [x] **D. EC2 생성 · 컨트롤 플레인** (Jira 새 티켓) — 사용자가 plan(생성 7개)을 읽고 승인 → apply → `common.sh` → `wg-up.sh` → `init-control-plane.sh` → Cilium. 결과를 SSOT 6절 「현재 상태」 · 10절 「잰 것」에. 그 뒤 읽기 전용 키 비활성화(사용자)
- [x] 마지막에 infra → dev MR 로 올리고 dev → 분야 브랜치 넷을 맞춘다(Delete source branch 끄기)

## 안 바꿀 것

- Lightsail 쪽 실제 작업(받는 날), Argo CD 설치 · root app 연결(join 뒤), Sealed Secrets kind 리허설, GitLab Runner · `.gitlab-ci.yml`, 운영 Dockerfile, HTTPS · DNS — 다음 계획
- `infra/kind/` 리허설 스크립트와 공통 `cilium-values.yaml` · `argocd-values.yaml`
- 하네스 게이트 동작(`.claude/hooks/`) — stack.md 의 infra 검사 명령 한 줄만 늘린다
- 분야 브랜치 보호 설정(사용자가 보류)

## 리스크

- **EC2 와 Lightsail 사이가 실제로 붙는지:** Lightsail 이 돌아오는 UDP 를 받아 주는지는 문서에 없다(미확인). 안 되면 2노드 설계가 막힌다 → 받는 날 `wg show` 의 latest handshake 로 먼저 보고, 막히면 Tailscale 이나 Lightsail 1대 구성을 다시 본다
- **MTU:** 큰 패킷만 조용히 사라지는 장애가 난다 → wg0 1420 · Cilium MTU 1420 고정, 받는 날 `ping -M do -s` 로 확인. Cilium 이 VXLAN 50바이트를 스스로 빼는지는 미확인
- **apply 권한이 모자람:** apply 가 중간에 멈춘다 → Terraform 은 다시 돌리면 이어서 만든다. 빠진 액션은 `aws sts decode-authorization-message` 로 찾아 정책에 더한다. 암호화 EBS 에 KMS 권한이 필요한지 미확인
- **비용:** EC2 를 오늘부터 띄우면 매일 요금이 나간다. 승인 금액(10/19~11/18 기준) 안이고 예산 알림 80% · 100% 가 있다. 11/18 뒤 `terraform destroy`
- **관리자 IP 가 바뀜(캠퍼스 ↔ 집):** SSH 가 막힌다 → `admin_cidrs` 고치고 apply
- **kubelet 이 wg0 보다 먼저 뜸(재부팅):** 노드 주소가 없어진다 → systemd 순서로 막고, EC2 에서 한 번 재부팅해 확인
- **Lightsail 443:** Ubuntu 기본 방화벽은 22 · 80 만 연다. 443 은 SSAFY 가 열어야 할 수 있다 → 8절에 올려 받는 날 묻는다

## 어떻게 검증하나

- A: `terraform test` 통과 수(보안 그룹 단언 「1개 · udp · 51820」 포함), fmt · validate, 옛 포트 서술 grep 0건
- B: `terraform init` 이 S3 백엔드로 성공, `aws s3api get-bucket-versioning` = Enabled, 퍼블릭 차단 4개 true, plan 이 「7 to add」, 상태 파일이 커밋 대상에 없음
- C: 위 정적 확인 전부 통과. kubeadm 설정 validate 성공. 실제 동작은 D 에서
- D: `terraform output` 의 탄력적 IP 로 SSH 성공, `ip -d link show wg0` mtu 1420, `kubectl get nodes -o wide` INTERNAL-IP 10.200.0.1 · Ready, `cilium status` OK, kube-system Pod 전부 Running, 재부팅 뒤에도 같음, AWS 콘솔 · CLI 로 크레딧 standard · IMDSv2 · 예산 확인

## 되돌리는 법

- A · B · C: MR 병합 커밋을 Revert. 코드와 문서만 바뀐다
- S3 버킷: 버전까지 비우고 삭제. 🔴 상태 파일을 지우면 Terraform 이 만든 자원을 잊는다 → EC2 가 있는 동안은 지우지 않는다
- D: `terraform destroy` 로 7개 자원을 지우면 요금이 멈춘다. 🔴 서버 안의 것(클러스터 · wg0 키)은 함께 사라지고 되살릴 수 없다 — 이 단계엔 서비스 데이터가 없다. 클러스터만 다시 하려면 `kubeadm reset`
- IAM apply 사용자: 콘솔에서 키 비활성화 · 사용자 삭제
