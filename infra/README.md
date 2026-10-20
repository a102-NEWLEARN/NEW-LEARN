# infra — 인프라 코드

**관리 서버(EC2)는 Terraform 으로 만들고 지운다. 상태 파일은 팀 계정 S3 에 두고, plan · apply 는 범위를 좁힌 apply 전용 키로 한다.** Lightsail 은 받는 날 join 만 하고, EC2 는 그 전에 만든다.
배포 구성과 정한 것은 `SSOT.md` 6절, 서버 준비 계획은 `docs/plans/2026-10-20-pre-server-infra.md` 에 있다.

| 폴더 | 무엇 |
|---|---|
| `terraform/` | 관리 서버(쿠버네티스 컨트롤 플레인) EC2 · 보안 그룹 · 탄력적 IP · 예산 알림. Lightsail 은 SSAFY 소유라 대상이 아니다 |
| `terraform/iam/` | apply 전용 IAM 사용자에 붙일 정책 — EC2 는 서울 리전만, 예산, 상태 버킷(`newlearn-tfstate-*`)만 |
| `kind/` | 내 PC 의 kind 리허설 클러스터 — 정의 · 올리기 · 지우기 · 무중단 교체 리허설 (아래 「kind 리허설」) |
| `k8s/bootstrap/` | 클러스터를 만든 뒤 Helm 으로 한 번 까는 것 — Cilium · Argo CD 값, 루트 Application. 실제 서버도 같은 값을 쓰고 다른 것만 덮는다 |
| `k8s/apps/` | Argo CD 가 Git 에서 읽는 앱 목록 (app-of-apps — 이 폴더를 Helm 차트로 그려 앱마다 Application 을 만든다) |
| `k8s/gateway/` · `k8s/hello/` | 외부 입구(Envoy Gateway — 워커 노드 80 에 hostPort) · 리허설용 hello 앱 |

검사 명령(포맷 · validate · test)은 `.claude/stack.md` 3절의 `infra_*` 줄에 있다. 자격 증명 없이 돈다 — `-backend=false` 로 init 해서 S3 를 안 보고, 테스트는 가짜 provider 를 쓴다.

## 처음 한 번

1. **도구** — Terraform 1.16.6 과 AWS CLI v2 를 설치한다. 설치한 뒤 터미널을 새로 연다 (PATH 반영).

   ```bash
   winget install --id Hashicorp.Terraform --version 1.16.6 --exact
   ```

   ```bash
   winget install --id Amazon.AWSCLI --exact
   ```

2. **apply 전용 IAM 사용자와 키** — plan · apply 모두 이 키로 한다. IAM Identity Center 는 쓰지 않는다 — 켜면 AWS Organization 이 만들어지면서 무료 플랜 크레딧이 바로 사라진다.
   1. IAM 콘솔 → 「정책」 → 「정책 생성」 → JSON 에 `infra/terraform/iam/apply-policy.json` 을 그대로 붙이고 이름을 `newlearn-terraform-apply` 로 만든다. 고객 관리형 정책이라 나중에 고치면 이전 버전이 남아 되돌릴 수 있다. 권한 요약에 EC2 · Budget · S3 · STS 네 서비스만 보이면 맞다
   2. 「IAM 사용자」 → 「사용자 생성」 → 이름 `newlearn-terraform-apply`, 콘솔 액세스는 체크하지 않는다. 권한 옵션 「직접 정책 연결」에서 1번 정책을 검색해 체크한다 (이 화면은 정책을 하나 이상 골라야 넘어간다)
   3. 그 사용자의 「보안 자격 증명」 → 「액세스 키 만들기」 → 사용 사례 「CLI」(권장 사항 확인란 체크). 비밀 키는 이 화면에서 한 번만 보이니 띄워 둔 채 바로 4번을 한다. .csv 는 받지 않는다
   4. 터미널에서 프로필에 넣는다. 키는 내 PC 의 `~/.aws/credentials` 에만 남고 저장소에는 들어가지 않는다 (리전 `ap-northeast-2`, 출력 `json`)

   ```bash
   aws configure --profile newlearn-apply
   ```

   ```bash
   aws sts get-caller-identity --profile newlearn-apply
   ```

   5. 10/18 에 만든 읽기 전용 키(`newlearn` 프로필)는 IAM 콘솔에서 비활성화한다. 상태 파일 잠금 때문에 plan 도 S3 에 잠금 파일을 써야 해서 읽기 전용 키로는 plan 이 안 된다

3. **상태 파일 버킷** — 처음 한 번만. 버킷 이름은 전 세계에서 하나여야 해서 임의 접미사를 붙이고, 그 이름은 `backend.hcl` 에만 적는다.

   ```bash
   B=newlearn-tfstate-$(openssl rand -hex 4); echo "$B"
   ```

   ```bash
   aws s3api create-bucket --bucket "$B" --region ap-northeast-2 --create-bucket-configuration LocationConstraint=ap-northeast-2 --profile newlearn-apply
   ```

   ```bash
   aws s3api put-bucket-versioning --bucket "$B" --versioning-configuration Status=Enabled --profile newlearn-apply
   ```

   ```bash
   aws s3api put-public-access-block --bucket "$B" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true --profile newlearn-apply
   ```

   버전 관리는 상태 파일을 잘못 덮었을 때 이전 판으로 되돌리려고 켠다. 상태 파일에는 만든 자원의 정보가 평문으로 들어가서 공개를 막는다.

4. **설정 파일 두 개** — 예시를 복사해 채운다. 둘 다 커밋하지 않는다.

   ```bash
   cp infra/terraform/backend.hcl.example infra/terraform/backend.hcl
   ```

   ```bash
   cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
   ```

   - `backend.hcl` 의 `bucket` — 3번에서 만든 이름
   - `terraform.tfvars` 의 `ssh_public_key` — 아래로 만든 `~/.ssh/newlearn-ec2.pub` 한 줄 (AWS 에는 키 페어 이름 `newlearn-admin` 으로 올라간다). 개인키는 저장소 밖에 둔다

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/newlearn-ec2 -C newlearn-ec2
   ```

   - `admin_cidrs` — 아래가 알려 주는 내 PC 공인 IP 에 `/32` 를 붙인다. 캠퍼스와 집처럼 자리를 옮기면 고치고 다시 apply 한다

   ```bash
   curl -s https://checkip.amazonaws.com
   ```

5. **init** — 상태 파일을 S3 로 연결한다.

   ```bash
   terraform -chdir=infra/terraform init -backend-config=backend.hcl
   ```

## plan

```bash
terraform -chdir=infra/terraform plan -out=ec2.tfplan
```

plan 은 아무것도 만들지 않는다. 처음에는 「7 to add, 0 to change, 0 to destroy」인지 본다 — 키 페어 · 보안 그룹 · SSH 규칙 · 나가는 규칙 · EC2 · 탄력적 IP · 예산 알림. Lightsail IP 를 넣기 전이라 WireGuard 규칙은 없다.

## apply

- 사람이 plan 을 읽고 apply 한다 (`.claude/docs/deploy.md` 3절). Claude 는 apply · destroy 를 치기 전에 묻게 되어 있다 (`.claude/settings.json`)
- 저장한 plan 파일로 apply 해서, 읽은 plan 과 다른 것이 만들어지지 않게 한다. `*.tfplan` 은 커밋하지 않는다

```bash
terraform -chdir=infra/terraform apply ec2.tfplan
```

```bash
terraform -chdir=infra/terraform output
```

- 만든 뒤 `ssh -i ~/.ssh/newlearn-ec2 ubuntu@<탄력적 IP>` 로 들어간다. 서버 안 설정(WireGuard · kubeadm · Cilium) 순서는 `docs/plans/2026-10-20-pre-server-infra.md` 작업 D
- 권한이 모자라 apply 가 멈추면 오류에 붙은 인코딩된 메시지를 풀어 빠진 액션을 찾고, `iam/apply-policy.json` 과 IAM 콘솔의 정책에 더한 뒤 다시 apply 한다. Terraform 은 만든 것까지 기억하고 이어서 만든다. 암호화한 루트 디스크(기본 `aws/ebs` 키)는 KMS 권한 없이 만들어졌다(2026-10-20 apply)

```bash
aws sts decode-authorization-message --encoded-message <메시지> --profile newlearn-apply
```

- 새 Ubuntu 이미지가 나와도 서버를 바꿔 끼우지 않는다 (`compute.tf` 의 `ignore_changes`). OS 갱신은 서버 안에서 한다
- **최종 발표(11/18) 뒤 `terraform destroy` 로 지운다.** 서버를 멈추기만 하면 EBS · 탄력적 IP 요금이 계속 나간다. 상태 버킷은 destroy 가 끝난 뒤 버전까지 비우고 지운다

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
