# infra — 인프라 코드

**관리 서버(EC2)는 Terraform 으로 만들고 지운다. 상태 파일은 팀 계정 S3 에 두고, plan · apply 는 범위를 좁힌 apply 전용 키로 한다.** Lightsail 은 받는 날 join 만 하고, EC2 는 그 전에 만든다.
배포 구성과 정한 것은 `SSOT.md` 6절, 서버 준비 계획은 `docs/plans/2026-10-20-pre-server-infra.md` 에 있다.

| 폴더 | 무엇 |
|---|---|
| `terraform/` | 관리 서버(쿠버네티스 컨트롤 플레인) EC2 · 보안 그룹 · 탄력적 IP · 예산 알림 · DB 백업 버킷. Lightsail 은 SSAFY 소유라 대상이 아니다 |
| `terraform/iam/` | apply 전용 IAM 사용자에 붙일 정책 — EC2 는 서울 리전만, 예산, 상태 버킷(`newlearn-tfstate-*`) · DB 백업 버킷(`newlearn-pg-backup-*`, 객체를 지우는 권한 없음 — 수명 규칙으로는 지울 수 있음)만. DB 백업을 올리기만 하는 사용자 정책 |
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

   - `backup_bucket_name` — DB 주간 백업 버킷. `newlearn-pg-backup-` 뒤에 `openssl rand -hex 4` 로 접미사를 붙인다 (아래 「DB 백업 버킷」)
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
- DB 백업 버킷은 `force_destroy` 를 꺼 두어 안에 백업이 있으면 destroy 가 멈춘다(실수 방지). 남길 백업을 받은 뒤 S3 콘솔(루트 계정)에서 「비우기」로 이전 판까지 비우고 destroy 한다(버전 관리 버킷, Jira S15P31A102-147) — apply 키에는 백업을 지우는 권한을 주지 않았다
- 손으로 찍은 EBS 스냅샷(예: 디스크 늘리기 전 `jira-146-before-50gib`)은 Terraform 밖이라 destroy 로 지워지지 않고 요금이 남는다 — EC2 콘솔(루트 계정) → 스냅샷에서 지운다

## 루트 디스크 늘리기 (Jira S15P31A102-146)

관리 서버를 멈추지 않고 늘린다. EBS 는 줄일 수 없다. 다시 바꾸려면 앞 변경이 `completed` 가 될 때까지 기다리고, 연속 24시간에 최대 4번까지 바꿀 수 있다(AWS 문서 「Modify an Amazon EBS volume using Elastic Volumes」, 2026-11-02 확인).

0. (권장) 스냅샷 — EC2 콘솔(루트 계정) → 볼륨 → 스냅샷 생성(apply 키에는 스냅샷 권한이 없다). 상태가 `완료됨` 이 된 뒤 다음으로(첫 스냅샷은 수십 분 걸릴 수 있다 — 잰 값은 `SSOT.md` 10절)
1. `variables.tf` 의 `root_volume_gb` 기본값과 `validation` 하한을 같이 올리고 MR 로 머지한다
2. plan 이 `aws_instance.control_plane` 하나를 제자리에서 바꾸는지(`1 to change`, `root_block_device` 의 `volume_size` 만) 본다. `must be replaced` 가 나오면 멈춘다 — 서버를 새로 만든다는 뜻이다
3. apply. apply 키에 `ec2:ModifyVolume` 이 있어야 한다(`iam/apply-policy.json`, IAM 콘솔의 정책도 같게)
4. 서버에서 `lsblk` 로 디스크(`nvme0n1`)가 새 크기인지 보고, 1번 파티션과 파일 시스템(ext4)을 넓힌다

```bash
sudo growpart /dev/nvme0n1 1
```

```bash
sudo resize2fs /dev/nvme0n1p1
```

5. `df -h /` 로 크기를 확인한다
6. 며칠 문제가 없으면 0번 스냅샷을 콘솔에서 지운다 — 지우면 되돌릴 수 없다

## CPU 크레딧 standard 로 되돌리기 (Jira S15P31A102-149)

지금 설정과 왜 그렇게 두었는지는 `SSOT.md` 6 · 9절에 있다. 서버를 멈추지 않고 바꾼다 — 크레딧 설정은 실행 중이거나 멈춘 인스턴스에서 언제든 바꿀 수 있다(AWS 문서 「Unlimited mode concepts for burstable instances」, 2026-11-02 확인).

0. 콘솔에서 두 값을 본다. 둘 다 EC2 가 5분마다 CloudWatch 로 보내는 인스턴스별 지표다. apply 키에는 CloudWatch 권한이 없어 사람이 본다
   - 크레딧 잔액(`CPUCreditBalance`) — EC2 콘솔 모니터링 탭의 「CPU 크레딧 밸런스」. 최대는 `SSOT.md` 6절
   - 초과 크레딧 잔액(`CPUSurplusCreditBalance`) — 쌓인 크레딧을 다 쓴 뒤 당겨 쓰고 아직 갚지 않은 크레딧. EC2 콘솔 모니터링 탭에 그래프가 있는지는 확인하지 못했다(AWS 문서는 CloudWatch 콘솔의 EC2 인스턴스별 지표를 안내한다. CloudWatch 를 쓸지는 `SSOT.md` 6절)
   - 초과 크레딧 잔액이 0 보다 크면 바꾸는 순간 그 초과분이 바로 청구된다. 이때 크레딧 잔액은 0 이고 그대로 넘어간다
   - 크레딧 잔액 0 으로 standard 가 되면 기준선(크레딧 없이 계속 쓸 수 있는 CPU 몫, 값은 `SSOT.md` 6절)보다 많이 쓰던 서버는 기준선까지 서서히 내려온다. 다시 쌓일 때까지 기준선을 넘지 못한다
   - 기준선 아래로 쓰는 동안에는 크레딧을 쌓기 전에 초과 크레딧부터 갚는다. 한가한 때를 기다리면 초과 크레딧 잔액이 0 이 된다
   - **초과 크레딧 잔액이 0 이고 크레딧 잔액이 넉넉할 때 바꾼다**
   - 출처(AWS EC2 사용 설명서, 2026-11-02 확인): 「Unlimited mode concepts for burstable instances」의 「What happens to credits when switching between Unlimited and Standard」 · 「Surplus credits can incur charges」, 「Key concepts for burstable performance instances」, 「Monitor CPU credits for burstable instances」의 「Calculate CPU credit usage for Unlimited instances」
1. 아래를 한 MR 에 함께 바꿔 머지한다. 하나라도 빠지면 문서가 서버와 어긋난다
   - `compute.tf` 의 `cpu_credits` 와 그 위 주석, `tests/security_group.tftest.hcl` 의 같은 단언과 오류 문구
   - `SSOT.md` 6절 서버 줄 · CPU 크레딧 줄, 9절에 뒤집은 줄 하나. 8절에 이 결정 줄이 남아 있으면 지운다
   - `infra/k8s/bootstrap/ci-exporter/ci-dashboard.json` 「노드 CPU 사용 (코어)」 설명(서버 적용은 4번 뒤)
   - 이 절 — 지우거나, 다시 켤 때를 위해 「unlimited 로 바꾸기」로 고쳐 쓴다
2. 머지한 코드로 plan 해서 `aws_instance.control_plane` 하나를 제자리에서 바꾸는지(`1 to change`, `credit_specification` 의 `cpu_credits` 만) 본다. 149 때도 같았다(MR !509). `must be replaced` 가 나오면 멈춘다
3. apply 직전에 0번을 다시 본다. 같은 서버에서 CI 가 돌아 그사이 초과 크레딧이 생길 수 있다. 조건이 맞으면 apply 한다 — apply 키에 `ec2:ModifyInstanceCreditSpecification` 이 있어야 한다(`iam/apply-policy.json`). 맞지 않으면 미룬다. 미루는 동안은 문서가 standard, 서버가 unlimited 라 오래 두지 않는다
4. 확인 — `standard` 가 나와야 한다

```bash
aws ec2 describe-instance-credit-specifications --instance-ids "$(terraform -chdir=infra/terraform output -raw control_plane_instance_id)" --query "InstanceCreditSpecifications[0].CpuCredits" --output text --region ap-northeast-2 --profile newlearn-apply
```

5. 대시보드 설명을 서버에 다시 적용한다 — `infra/server/README.md` 「CI 잡 지표」

## DB 백업 버킷 · 올리는 키 (Jira S15P31A102-109)

매주 DB 백업 하나를 S3 에 올린다(`backup.tf`). 버전 관리를 켜 두어 같은 이름으로 덮어쓰거나 지워도 이전 판이 남는다(Jira S15P31A102-147) — 보관 기간은 `SSOT.md` 6절 「저장소·백업」. 쓰는 법 · 되살리는 법은 `infra/server/db-backup.md`. 처음 한 번 사람이 콘솔에서 한다.

1. **apply 정책 고치기** — IAM 콘솔 → 「정책」 → `newlearn-terraform-apply` → 「편집」 → JSON 탭에 `infra/terraform/iam/apply-policy.json` 을 그대로 붙이고 저장한다. 버킷 `newlearn-pg-backup-*` 를 만들고 설정 · 읽는 권한이 더해진다(객체를 지우는 권한은 없다. 다만 수명 규칙은 바꿀 수 있어 그것으로 지울 수 있고, 버전 관리를 멈추면 그 뒤 덮어쓴 이전 판이 남지 않는다 — apply 키도 아껴 쓴다). 이전 판은 「정책 버전」에 남아 되돌릴 수 있다
2. **버킷 만들기** — `terraform.tfvars` 에 `backup_bucket_name` 을 넣고 plan → 「4 to add, 0 to change, 0 to destroy」(버킷 · 공개 막기 · 버전 관리 · 수명 규칙)인지 사람이 보고 그 plan 으로 apply 한다
3. **올리기만 되는 사용자** — 「정책 생성」 → JSON 에 `infra/terraform/iam/pg-backup-uploader-policy.json` 을 붙이고 `<관리 서버 탄력적 IP>` 자리에 `terraform -chdir=infra/terraform output control_plane_public_ip` 값을 넣는다(저장소에는 IP 를 적지 않는다. 올리는 잡은 관리 서버에서만 돈다) · 이름 `newlearn-pg-backup-uploader` → 「사용자 생성」 → 이름 `newlearn-pg-backup-uploader`, 콘솔 액세스 없음, 「직접 정책 연결」로 그 정책 → 「보안 자격 증명」 → 「액세스 키 만들기」 → 사용 사례 「AWS 외부에서 실행되는 애플리케이션」. 비밀 키는 이 화면에서 한 번만 보인다 — 띄워 둔 채 바로 4번에 입력하고 어디에도 저장하지 않는다
4. **봉인** (EC2 터미널, 값을 묻는다) — 버킷 이름은 `terraform -chdir=infra/terraform output pg_backup_bucket`

   ```bash
   ssh -t ubuntu@<EC2 탄력적 IP> "bash infra/server/seal-secrets.sh pg-backup-s3"
   ```

   만든 `~/sealed/sealed-pg-backup-s3.yaml` 을 `infra/k8s/services/data/sealed-pg-backup-s3.yaml` 로 가져와 커밋 · MR 한다
- 키가 샜으면 IAM 콘솔에서 그 키를 비활성화하고 3 · 4번을 다시 한다. 이 키로는 백업을 읽거나 지울 수 없고, 관리 서버 IP 조건이 걸려 있다(다른 IP 에서 거절되는지는 확인 못 함 — `SSOT.md` 10절). 같은 이름으로 덮어써도 이전 판이 남는다. 다만 IP 조건은 관리 서버에서 나가는 모든 Pod 를 같은 IP 로 본다 — 같은 서버에서 도는 CI 잡 안에서는 샌 키를 쓸 수 있다. 나중에 S3 게이트웨이 엔드포인트를 붙이면 출발지가 사설 IP 로 바뀌어 이 조건이 올리기를 막는다(그때는 `aws:SourceVpce` 로 바꾼다)
- 이미 만든 사용자에 버전 관리 · IP 조건을 더할 때(2026-11-02, Jira S15P31A102-147): 1번처럼 apply 정책을 새 JSON 으로 바꾸고, 「정책」 → `newlearn-pg-backup-uploader` → 「편집」에 3번처럼 IP 를 채운 JSON 을 붙인다. 그다음 plan(「1 to add, 1 to change, 0 to destroy」)을 보고 apply 하고, 15분 뒤 `infra/server/db-backup.md` 「확인 · 손으로 돌리기」로 올리기 잡을 한 번 돌려 막히지 않았는지 본다(버전 관리를 처음 켠 뒤 15분은 쓰기를 미루라는 AWS 권고 — 「Enabling versioning on buckets」). 막히면 그 정책의 「정책 버전」에서 이전 판으로 되돌린다

## 이미지 저장소 (GHCR)

운영 이미지는 CI 의 w4 잡이 dev 에서 굽고 GHCR 에 올린다. 왜 GHCR 인지 · 태그 규칙 · 굽는 때는 `SSOT.md` 6절 「배포 흐름」.
코드와 CI 는 GitLab 그대로고, 이미지를 두는 창고만 GitHub 에 있다.

| 무엇 | 값 |
|---|---|
| 이미지 | `ghcr.io/kimzoo5676-del/newlearn-backend` · `newlearn-frontend` · `newlearn-ai` — 비공개 |
| 빌드 캐시 | `ghcr.io/kimzoo5676-del/newlearn-kaniko-cache` — 비공개 |
| 태그 | 커밋 짧은 SHA 8자 |

### 처음 한 번 — 토큰 (사람이 한다)

토큰 화면과 값은 사람만 본다. 저장소 · 대화에 붙여 넣지 않는다.

1. **GitHub** › Settings › Developer settings › Personal access tokens › Tokens (classic) › Generate new token (classic). GHCR 은 classic 토큰만 받는다

   | 칸 | 값 |
   |---|---|
   | Note | `newlearn-ci-push` |
   | Expiration | Custom — 2026-11-30 (발표 뒤) |
   | Scopes | `write:packages` 하나 — `read:packages` 가 같이 켜진다. `repo` 등 다른 칸은 켜지 않는다 |

2. **GitLab** › Settings › CI/CD › Variables › Add variable — 두 개

   | Key | Value | Visibility | Protect variable |
   |---|---|---|---|
   | `GHCR_USER` | GitHub 아이디 | Visible | 켬 |
   | `GHCR_TOKEN` | 1에서 만든 토큰 | Masked and hidden | 켬 |

   Protect 를 켜면 보호 브랜치(dev) 파이프라인에만 들어간다. MR 파이프라인은 토큰 없이 굽기만 한다

3. **확인** — dev 파이프라인의 w4 잡이 초록이고, GitHub 프로필 › Packages 에 `newlearn-` 패키지가 Private 으로 있다. 처음 올린 패키지는 비공개로 생긴다 — 공개로 바꾸지 않는다

w4 잡이 `error checking push permissions ... DENIED: requested access to the resource is denied` 로 실패하면 잡에 토큰이 안 들어온 것이다. Variables 목록에 두 줄이 있는지 본다 — 서랍 맨 아래 **Add variable** 을 눌러야 저장된다 (2026-10-21 겪음). 넣은 뒤 실패한 w4 잡만 다시 돌리면 같은 커밋 태그로 올라간다

### 11/18 뒤 정리

- GitHub › Packages 에서 `newlearn-` 패키지 넷을 지운다 (패키지 › Package settings › Delete this package)
- 토큰을 지운다 (Developer settings › Tokens (classic)), GitLab 변수 두 개를 지운다
- 워커가 받는 읽기 토큰(Jira S15P31A102-91)도 같이 지운다

## kind 리허설

> **2026-10-22 은퇴 — 지금은 돌지 않는다.** 실제 클러스터가 생겨 앱 목록에 cert-manager · 운영 키로 봉인한 Secret · 서비스가 들어갔고, 시험 앱 hello 는 지웠다(Jira S15P31A102-105). 아래는 Jira S15P31A102-77 때의 기록이다. 확인은 실제 서버에서 한다 — `infra/server/README.md`, 결과는 `SSOT.md` 6 · 10절

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
