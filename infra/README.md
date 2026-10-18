# infra — 인프라 코드

**지금은 관리 서버(EC2)를 Terraform 코드로 써 두고 `plan` 까지만 돌린다.** 실제로 만드는 apply 는 Lightsail 을 받은 뒤 별도 티켓에서 한다.
배포 구성과 정한 것은 `SSOT.md` 6절, 이 작업의 계획은 `docs/plans/2026-10-18-infra-terraform-kind.md` 에 있다.

| 폴더 | 무엇 |
|---|---|
| `terraform/` | 관리 서버(쿠버네티스 컨트롤 플레인) EC2 · 보안 그룹 · 탄력적 IP · 예산 알림. Lightsail 은 SSAFY 소유라 대상이 아니다 |
| `kind/` | 내 PC 의 kind 리허설 클러스터 — 정의 · 올리기 · 지우기 · 무중단 교체 리허설 (아래 「kind 리허설」) |
| `k8s/bootstrap/` | 클러스터를 만든 뒤 Helm 으로 한 번 까는 것 — Cilium · Argo CD 값, 루트 Application. 실제 서버도 같은 값을 쓰고 다른 것만 덮는다 |
| `k8s/apps/` | Argo CD 가 Git 에서 읽는 앱 목록 (app-of-apps — 이 폴더를 Helm 차트로 그려 앱마다 Application 을 만든다) |
| `k8s/gateway/` · `k8s/hello/` | 외부 입구(Envoy Gateway — 워커 노드 80 에 hostPort) · 리허설용 hello 앱 |

검사 명령(포맷 · validate · test)은 `.claude/stack.md` 3절의 `infra_*` 줄에 있다. 자격 증명 없이 돈다 — 테스트는 가짜 provider 를 쓴다.

## 처음 한 번

1. **도구** — Terraform 1.16.6 과 AWS CLI v2 를 설치한다. 설치한 뒤 터미널을 새로 연다 (PATH 반영).

   ```bash
   winget install --id Hashicorp.Terraform --version 1.16.6 --exact
   ```

   ```bash
   winget install --id Amazon.AWSCLI --exact
   ```

2. **AWS 자격 증명** — 읽기 전용 IAM 사용자의 액세스 키를 쓴다. IAM Identity Center 는 쓰지 않는다 — 켜면 AWS Organization 이 만들어지면서 무료 플랜 크레딧이 바로 사라진다.
   1. IAM 콘솔에서 사용자를 만든다. 콘솔 접근은 주지 않고 `ReadOnlyAccess` 정책만 붙인다
   2. 그 사용자의 「보안 자격 증명」에서 액세스 키를 만든다 (사용 사례: CLI)
   3. 터미널에서 프로필에 넣는다. 키는 내 PC 의 `~/.aws/credentials` 에만 남고 저장소에는 들어가지 않는다 (리전 `ap-northeast-2`, 출력 `json`)

   ```bash
   aws configure --profile newlearn
   ```

   ```bash
   aws sts get-caller-identity --profile newlearn
   ```

3. **변수 파일** — 예시를 복사해 채운다. `terraform.tfvars` 는 커밋하지 않는다 (관리자 IP · 메일).

   ```bash
   cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
   ```

## plan

```bash
terraform -chdir=infra/terraform plan
```

plan 은 아무것도 만들지 않는다. 결과가 추가(to add)만 있고 변경 · 삭제가 0 인지 본다.
읽기 전용 키라 apply 를 쳐도 AWS 가 거절한다. **plan 이 끝나면 IAM 콘솔에서 그 키를 비활성화한다.**

## apply 는 아직 하지 않는다

- 사람이 plan 을 읽고 apply 한다 (`.claude/docs/deploy.md` 3절). Claude 는 apply · destroy 를 치기 전에 묻게 되어 있다 (`.claude/settings.json`)
- apply 전에 할 것 (`SSOT.md` 6 · 8절)
  - 유료 플랜 업그레이드 — 2026-10-18 에 했다 (무료 플랜에서는 t3.large 를 못 띄울 수 있다. 크레딧은 남는다)
  - apply 용 키는 범위를 좁힌 권한(EC2 · 탄력적 IP · 보안 그룹 · 키 페어 · 예산)으로 따로 만든다
  - 상태 파일(`*.tfstate`)을 둘 곳을 정한다. 상태 파일에는 만든 자원의 비밀값이 평문으로 들어가고, 내 PC 에만 두면 PC 를 반납 · 분실했을 때 destroy 가 어렵다. 커밋하지 않는다
- 새 Ubuntu 이미지가 나와도 서버를 바꿔 끼우지 않는다 (`compute.tf` 의 `ignore_changes`). OS 갱신은 서버 안에서 한다
- **최종 발표(11/18) 뒤 `terraform destroy` 로 지운다.** 서버를 멈추기만 하면 EBS · 탄력적 IP 요금이 계속 나간다

## kind 리허설

서버가 오기 전에 내 PC 의 kind(Docker 컨테이너를 노드로 쓰는 쿠버네티스)로 배포 흐름(`SSOT.md` 6절)을 돌려 본다.
노드 2개(컨트롤 플레인 1 · 워커 1)에 Cilium → Argo CD 를 깔고, Argo CD 가 Git 에서 Envoy Gateway · Gateway · hello 앱을 가져가 깐다.

### 도구

kind 0.33.0 · Helm 4.3.1 · kubectl · Docker Desktop. 설치한 뒤 터미널을 새로 연다 (PATH 반영).

```bash
winget install --id Kubernetes.kind --version 0.33.0 --exact
```

```bash
winget install --id Helm.Helm --version 4.3.1 --exact
```

### 올리기 · 리허설 · 지우기

```bash
bash infra/kind/up.sh
```

```bash
bash infra/kind/sync.sh
```

```bash
bash infra/kind/rehearse-rollout.sh
```

```bash
bash infra/kind/down.sh
```

- `up.sh` — 클러스터 생성 → Cilium → 로컬 Git 미러 → Argo CD → 루트 Application → 앱이 모두 Synced · Healthy 가 될 때까지 기다린 뒤 `http://127.0.0.1:18080/` 에 hello v1 이 뜨는지 본다. 다시 돌려도 된다. 처음에는 이미지를 받느라 오래 걸린다 (`SSOT.md` 10절)
- `sync.sh` — `infra/k8s` 를 고친 뒤 돌린다. 미러에 커밋하고 Argo CD 에 다시 읽으라고 알린다. 반영은 Argo CD 가 한다
- `rehearse-rollout.sh` — hello v1 → v2 를 Git 에 커밋해 Argo CD 로 반영하고 `git revert` 로 v1 에 돌아온다. 그동안 요청을 계속 보내 실패 수와 걸린 시간을 찍는다. 실패가 1번이라도 있으면 실패로 끝난다
- `down.sh` — 클러스터와 Git 미러 컨테이너를 지운다
- **도는 동안 스크립트를 고치지 않는다.** bash 는 스크립트를 실행하면서 이어 읽어서, 중간에 고치면 엉뚱한 줄에서 문법 오류로 멈춘다

### 주의

- **스크립트는 kubeconfig 를 `infra/kind/.kubeconfig` 에만 쓴다.** 내 `~/.kube/config`(다른 프로젝트 클러스터가 있을 수 있다)는 건드리지 않고, 컨텍스트가 `kind-newlearn` 이 아니면 멈춘다. 손으로 kubectl 을 칠 때도 앞에 붙인다

  ```bash
  KUBECONFIG=infra/kind/.kubeconfig kubectl get nodes
  ```

- Argo CD 는 팀 GitLab 대신 **로컬 Git 미러**(`infra/kind/.git-mirror`, 컨테이너 `newlearn-git`)를 읽는다. `up.sh` 가 작업 트리의 `infra/k8s` 를 미러에 커밋하므로 커밋하기 전 매니페스트도 리허설된다. 배포 토큰도, 원격 브랜치도 필요 없다
- 워커 노드의 80 · 443 은 이 PC 의 `127.0.0.1:18080` · `18443` 으로 나온다 (`kind/cluster.yaml`). 이 PC 밖에서는 못 들어온다
- Argo CD 화면은 포트를 열고 `http://127.0.0.1:18081` 에서 본다. kind 에서는 로그인 없이 읽기만 된다 (`k8s/bootstrap/argocd-values.kind.yaml` — 실제 서버에는 쓰지 않는다)

  ```bash
  KUBECONFIG=infra/kind/.kubeconfig kubectl -n argocd port-forward svc/argocd-server 18081:80
  ```

- 리허설로 확인할 수 없는 것 — 계정이 다른 EC2 · Lightsail 노드가 인터넷을 거쳐 붙는 네트워크, 공인 IP 의 80 · 443, HTTPS 인증서, Argo CD 가 GitLab 배포 토큰으로 읽는 것. Lightsail 을 받은 날 확인한다 (`SSOT.md` 8절)
- 리허설 결과 · 잰 숫자 · 알게 된 한계(Envoy 교체 때 잠깐 끊김)는 `SSOT.md` 6 · 10절
