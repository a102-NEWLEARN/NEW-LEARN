# infra — 인프라 코드

**지금은 관리 서버(EC2)를 Terraform 코드로 써 두고 `plan` 까지만 돌린다.** 실제로 만드는 apply 는 Lightsail 을 받은 뒤 별도 티켓에서 한다.
배포 구성과 정한 것은 `SSOT.md` 6절, 이 작업의 계획은 `docs/plans/2026-10-18-infra-terraform-kind.md` 에 있다.

| 폴더 | 무엇 |
|---|---|
| `terraform/` | 관리 서버(쿠버네티스 컨트롤 플레인) EC2 · 보안 그룹 · 탄력적 IP · 예산 알림. Lightsail 은 SSAFY 소유라 대상이 아니다 |

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
  - 무료 플랜에서는 t3.large 를 못 띄울 수 있다 → 콘솔의 Upgrade plan 으로 유료 플랜으로 올린다 (크레딧은 남는다)
  - apply 용 키는 범위를 좁힌 권한(EC2 · 탄력적 IP · 보안 그룹 · 키 페어 · 예산)으로 따로 만든다
  - 상태 파일(`*.tfstate`)을 둘 곳을 정한다. 상태 파일에는 만든 자원의 비밀값이 평문으로 들어가고, 내 PC 에만 두면 PC 를 반납 · 분실했을 때 destroy 가 어렵다. 커밋하지 않는다
- 새 Ubuntu 이미지가 나와도 서버를 바꿔 끼우지 않는다 (`compute.tf` 의 `ignore_changes`). OS 갱신은 서버 안에서 한다
- **최종 발표(11/18) 뒤 `terraform destroy` 로 지운다.** 서버를 멈추기만 하면 EBS · 탄력적 IP 요금이 계속 나간다
