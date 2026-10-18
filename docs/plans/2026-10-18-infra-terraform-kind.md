# infra/ 시작 — EC2 Terraform(plan 까지)과 kind 리허설

## 무엇을 / 왜

서버(EC2 · Lightsail)가 아직 없어서 배포 설계(`SSOT.md` 6절)를 실제로 돌려 보지 못했다. 돈이 들지 않는 두 가지를 먼저 한다.
① 관리 서버(EC2)를 Terraform 코드로 써서 `terraform plan` 까지만 돌린다 — 아무것도 만들지 않는다.
② 내 PC 의 kind(Docker 안에서 도는 쿠버네티스)에 Cilium · Envoy Gateway · Argo CD 를 올려 GitOps 배포 · 무중단 교체 · 되돌리기를 미리 해 본다.
Lightsail 을 받는 날 바로 붙일 수 있게 하고, 실제 서버에서만 확인할 수 있는 것(계정이 다른 두 노드의 네트워크)은 따로 적어 둔다.

## 정한 것 (질문 답 · 확인한 버전)

| 항목 | 값 | 근거 |
|---|---|---|
| EC2 OS | Ubuntu 24.04 LTS | 사용자 선택. Lightsail OS 가 다르면 그때 맞춘다 |
| plan 자격 증명 | 읽기 전용 IAM 사용자 키 (`aws configure --profile newlearn`) | 처음엔 IAM Identity Center 로 정했으나 2026-10-18 바꿈 — 켜면 AWS Organization 이 만들어지면서 무료 플랜 크레딧 $100 이 사라진다(콘솔 안내). 사용자 설계: plan 은 읽기 전용 키, apply 는 범위를 좁힌 권한을 따로 |
| 작업 단위 | Jira 티켓 · MR 2개, 둘 다 `infra` 분야 브랜치로 | 사용자 선택 · `docs/git-convention.md` |
| 도구 설치 | Windows 에 winget, 버전 고정 | 사용자 선택 |
| Terraform | 1.16.6 · AWS provider 6.69.1 | 2026-10-18 GitHub 최신 릴리스 |
| Kubernetes | 1.36 (kind 노드 `kindest/node:v1.36.4`) | 최신 안정판은 1.37.1 이지만 Cilium 1.20 · Envoy Gateway 1.9 · Argo CD 3.5 가 공통으로 지원하는 최신이 1.36 (각 프로젝트 호환표) |
| Cilium · Envoy Gateway · Argo CD | 1.20.3 · 1.9.2(Gateway API 1.6.1 포함) · 3.5.5(차트 10.10.5) | 최신 릴리스 |
| kind · Helm | 0.33.0 · 4.3.1 | 최신 릴리스 |

## 작업 순서

### ① EC2 Terraform — Jira 새 티켓 「[INFRA] 관리 서버(EC2) Terraform 코드 — plan 까지」 (SP 2)

- [x] Jira 티켓을 만든다(에픽 27 · 라벨 infra · newlearn-mvp · 스프린트 2) — 브랜치 `chore/infra/S15P31A102-<번호>-terraform-ec2`
- [x] 도구 설치: winget 으로 Terraform · AWS CLI v2 (설치 전에 패키지 이름 · 버전 · 출처를 보여 주고 확인받는다)
- [x] 사용자 몫 — IAM 콘솔에서 ReadOnlyAccess 만 붙인 사용자 · 액세스 키를 만들고 `aws configure --profile newlearn` 에 넣는다 (키는 내가 보지 않는다). plan 뒤 키 비활성화
- [x] `infra/terraform/` 작성 — 아래 「바꿀 파일」 — `terraform fmt -check` · `validate` · `test` 통과로 확인 (자격 증명 없이 돈다)
- [x] 하네스에 `infra` 영역 추가, apply · destroy 는 물어보게 — `pre-commit --ci-fast` · `--ci` 통과로 확인
- [x] `terraform plan` — 「N to add, 0 to change, 0 to destroy」 와 만들 자원 목록을 MR 에 남긴다 (관리자 IP 는 가린다)
- [x] SSOT · stack.md · infra/README.md 갱신 → 커밋 · push · `infra` 대상 MR · 머지 · Jira 완료

### ② kind 리허설 — Jira 새 티켓 「[INFRA] kind 로 쿠버네티스 배포 리허설」 (SP 5)

- [ ] Jira 티켓 · 브랜치 `chore/infra/S15P31A102-<번호>-kind-rehearsal`, winget 으로 kind · Helm 설치
- [ ] `infra/kind/` — 노드 2개(컨트롤 플레인 1 · 워커 1, 실제 구성과 같은 모양), 기본 CNI 끔, kubeconfig 를 `infra/kind/.kubeconfig` 에 따로 둔다
- [ ] 부트스트랩 스크립트: Cilium → Argo CD 를 Helm 으로 깔고, 루트 Application(app-of-apps)을 건다 — 노드 Ready · Cilium 정상으로 확인
- [ ] `infra/k8s/apps/` — Envoy Gateway(Helm 차트) · GatewayClass · Gateway · hello 앱(2개 복제 · 준비 확인 · HTTPRoute)을 Argo CD 가 Git 에서 가져가 깐다 — 모두 Synced · Healthy, `curl` 로 hello v1
- [ ] 외부 입구 실험: 워커 노드의 80 · 443 에 Envoy 를 직접 연다(hostPort). kind 는 포트 매핑으로 흉내 낸다. 안 되면 NodePort 로 바꾸고 결과를 SSOT 8절에 적는다
- [ ] 배포 · 되돌리기: 버릴 브랜치 `rehearsal/kind-gitops` 에 v2 를 push → Argo CD 반영 중 요청 N번을 보내 실패 0 인지 → `git revert` 로 v1 복귀까지 잰다. 끝나면 브랜치를 지운다
- [ ] Argo CD 가 저장소를 읽을 배포 토큰(읽기 전용)은 사용자가 GitLab 에서 만들어 스크립트 실행 때만 넣는다. 끝나면 토큰을 폐기한다
- [ ] SSOT 6 · 8 · 10절, stack.md §3 · §6 갱신 → 커밋 · push · `infra` 대상 MR · 머지 · Jira 완료 · `kind delete cluster`

## 바꿀 파일

**①**
- `infra/terraform/versions.tf` · `providers.tf` — Terraform · provider 버전, 서울 리전, SSO 프로필, 공통 태그(Project=newlearn, ManagedBy=terraform)
- `infra/terraform/network.tf` — 기본 VPC 를 쓰고 보안 그룹을 만든다. 22 는 관리자 IP 에만(kubectl 은 SSH 터널, 6443 을 밖에 안 연다). 워커(Lightsail) IP 를 넣으면 6443 · 10250 · Cilium 터널 8472/udp · 상태 확인 4240 을 그 IP 에만 연다 (IP 를 모르는 지금은 규칙 없음) — 2026-10-18 사용자 설계에 맞춰 고침
- `infra/terraform/compute.tf` — Ubuntu 24.04 AMI 조회(Canonical), 키 페어, t3.large · gp3 30 GiB 암호화 · IMDSv2 필수 · CPU 크레딧 standard, 탄력적 IP(EIP — 컨트롤 플레인 주소가 바뀌면 클러스터 인증서가 깨진다)
- `infra/terraform/budget.tf` — 승인 금액 $92.27 을 10/1 부터 쌓인 비용 합계(크레딧 빼기 전)에 대 보는 예산과 메일 알림 (`SSOT.md` 6절 빌링 알람). EC2 와 같이 apply 한다
- `infra/terraform/outputs.tf` · `terraform.tfvars.example` · `tests/security_group.tftest.hcl`(가짜 provider 로 「SSH · 6443 을 전 세계에 열지 않는다」 · 「워커 IP 가 없으면 노드 포트를 안 연다」를 검사)
- `infra/.gitignore` — `.terraform/` · `*.tfplan`. 루트 `.gitignore` 와 stack.md §8 — `infra/terraform/terraform.tfvars`(관리자 IP · 메일 · 공개키) · `infra/kind/.kubeconfig`
- `.claude/stack.md` — §2 infra 행, §3 `AREAS` 에 infra 와 명령(fmt · validate · test), §8 로컬 전용 파일
- `.claude/settings.json` — `terraform apply` · `terraform destroy` 를 물어보는 목록(ask)에 (사람이 plan 을 읽고 apply 한다 — `.claude/docs/deploy.md` 3절)
- `SSOT.md` — 6절 EC2 사양 · Terraform 흐름, 8절 갱신: GitLab 18.11.5 로 확인(행 삭제 → 6절로), 러너 없음, Container Registry 화면 404(이미지 저장소 행 갱신), 상태 파일 위치(apply 전에 정함), apply 용 권한 세트, 계정이 다른 두 노드의 네트워크(Lightsail 받는 날 확인)
- `infra/README.md` — 도구 설치 · SSO 로그인 · validate/test/plan 하는 법

**②**
- `infra/kind/cluster.yaml` · `up.sh` · `down.sh` — 클러스터 생성 · 부트스트랩 · 삭제. 스크립트는 kubeconfig 를 `infra/kind/.kubeconfig` 로만 쓰고 컨텍스트가 `kind-newlearn` 이 아니면 멈춘다
- `infra/k8s/bootstrap/` — Cilium · Argo CD Helm 값 (실제 서버에서도 같은 값을 쓰고 다른 것만 덮는다)
- `infra/k8s/apps/` — 루트 Application, Envoy Gateway · Gateway · hello 앱 매니페스트
- `SSOT.md` 6 · 8 · 10절, `.claude/stack.md` §3(`infra_RUN`) · §6(배포 설정 경로 `infra/k8s/apps/`), `infra/README.md` 리허설 절

## 안 바꿀 것

- **AWS 에 아무것도 만들지 않는다.** apply 는 이 계획 밖이다 — 읽기 전용 권한이라 만들 수도 없다
- 우리 앱(화면 · API · 워커) · PostgreSQL · Redis 의 쿠버네티스 배포, 운영용 Dockerfile — 이미지 저장소가 정해진 뒤 Jira 29 · 32 몫
- cert-manager · HTTPS 인증서 · 가비아 DNS — 공인 주소가 있어야 확인된다
- CI(`.gitlab-ci.yml`) · GitLab Runner, Prometheus · Grafana, kubeadm 설치 스크립트
- 분야 브랜치 보호 설정, 기존 `compose.yaml` · 앱 코드
- 내 `~/.kube/config` 와 거기 있는 다른 프로젝트(GKE) 컨텍스트

## 리스크

- **kubectl 이 다른 프로젝트의 GKE 클러스터를 건드릴 수 있다.** 지금 기본 컨텍스트가 그 클러스터다 → 모든 명령을 `KUBECONFIG=infra/kind/.kubeconfig` 로만 돌리고, 스크립트가 컨텍스트를 확인한다. 시작 전후에 `~/.kube/config` 의 현재 컨텍스트가 그대로인지 본다
- **리허설로는 진짜 위험을 못 잰다.** EC2(팀 계정)와 Lightsail(SSAFY 지급 — 다른 계정으로 추정)이 인터넷을 거쳐 붙어야 하고, SSAFY 가 Lightsail 방화벽 권한을 주는지 모른다. 막히면 두 노드 구성을 바꿔야 한다 → SSOT 8절에 올리고 Lightsail 받는 날 첫 확인 항목으로 둔다
- 읽기 전용이어도 장기 액세스 키다 → `~/.aws/credentials` 에만 두고 plan 이 끝나면 비활성화한다
- Terraform 1.16.6 · provider 6.69.1 은 나온 지 사흘~나흘 된 판이다. 문제가 보이면 바로 전 패치로 내린다
- kind 노드 2개 + Cilium · Argo CD · Envoy 가 메모리를 몇 GB 쓴다 → 리허설 동안 compose 환경은 내린다
- hostPort 로 80 · 443 을 여는 방식이 Cilium 과 안 맞을 수 있다 → 그게 이 실험의 목적이고, 안 되면 NodePort 로 바꾼다
- winget 설치는 이 PC 에 프로그램을 더한다 → 설치 전에 확인받는다

## 어떻게 검증하나

**①**
- 자격 증명 없이: `terraform fmt -check -recursive` · `terraform validate` · `terraform test` 통과 (보안 그룹 검사 포함)
- SSO 로그인 뒤 `terraform plan` → 「to add」 만 있고 change · destroy 0. 목록에 키 페어 · 보안 그룹과 규칙 · 인스턴스 · EIP · 예산이 있다
- `aws ec2 describe-instances --profile newlearn` 결과가 비어 있다 (만든 것이 없다)
- `bash .claude/hooks/pre-commit --ci-fast` · `--ci` 와 `.claude/hooks/tests/run.sh` 통과

**②**
- 노드 2개 Ready, Cilium 에이전트 정상(`cilium-dbg status`), Argo CD 앱이 모두 Synced · Healthy
- `curl` 로 hello v1 → v2 반영 중 요청 N번 실패 0 → revert 뒤 v1. 반영 · 되돌리기 걸린 시간을 SSOT 10절에
- 리허설 전후 `~/.kube/config` 의 현재 컨텍스트가 GKE 그대로, `kind delete cluster` 뒤 컨테이너가 남지 않는다
- ① 과 같은 커밋 게이트 · CI 층 통과

## 되돌리는 법

- 저장소: 각 MR 의 머지 커밋을 revert 한다. 대부분 새 파일이다
- AWS: ①은 아무것도 만들지 않아 되돌릴 것이 없다. 읽기 전용 IAM 사용자와 키는 IAM 콘솔에서 지운다
- kind: `kind delete cluster --name newlearn` 이 클러스터를 통째로 지운다. 배포 토큰은 GitLab 에서 폐기, `rehearsal/kind-gitops` 브랜치는 원격에서 지운다
- 도구: `winget uninstall` 로 지운다
