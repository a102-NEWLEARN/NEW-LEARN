# 11-02 사후 점검 후속 — 계획 체크칸 · CPU 크레딧 되돌리는 법 · 디스크 하한 (Jira S15P31A102-151)

## 무엇을 / 왜

2026-11-02 Jira 146(루트 디스크 50GiB) · 147(백업 버킷 버전 관리) · 149(CPU 크레딧 unlimited) · 150(문서 어긋남 정리)의 `/feature-done` 점검에서 남은 문서 일을 MR 하나로 끝낸다. 넷 다 Jira 완료다. 그런데 `docs/plans/2026-11-02-doc-drift-cleanup.md` 의 체크칸이 비어 있다. unlimited 를 되돌리는 법도 어디에도 없다. 디스크 크기를 두 곳에 적은 곳도 하나 있다(약속 4). AWS 자원은 바꾸지 않는다. Terraform 에는 변수 검사(`validation`) 하나만 더한다.

**승인받을 판단 하나:** `root_volume_gb` 의 `validation` 은 티켓에서 「선택」이다. 이 계획은 **넣는 쪽**으로 썼다(이유는 아래 「`validation` 을 넣는 이유」). 빼면 ㉠ 표시한 항목이 같이 빠진다.

## 계획에서 바뀐 것 (reviewer 조수 계획 리뷰 2026-11-02, 「고쳐야 함」 1 · 선택 반영)

- **고쳐야 함 — 되돌리는 절차가 두 파일만 바꿈:** 그대로 따르면 SSOT 6절 서버 줄 · 크레딧 줄과 대시보드 설명에 「unlimited」가 남는다. 8절 규칙(정해지면 이 표에서 지운다)과 9절 규칙(뒤집으면 한 줄)도 빠졌다 → README 절차 1번에 함께 바꿀 곳을 모두 적는다
- 콘솔 확인을 MR 앞으로 옮기고 「초과 크레딧 잔액 0 · 크레딧 잔액 넉넉할 때」를 기준으로 적는다. 기준선 아래로 쓰는 동안 초과 크레딧부터 갚는다(AWS 문서)
- 「1 to change」 근거는 팀이 볼 수 있는 149 커밋(MR !509 본문 「plan 은 control_plane 제자리 변경 하나」)으로. `must be replaced` 면 멈춘다는 줄을 더한다. 확인 명령은 한 줄 전체로
- README 에는 「vCPU 당 30%」 대신 「기준선(`SSOT.md` 6절)」 — 30% 는 t3.large 값이라 사양이 바뀌면 틀린다
- `validation` 근거 보강: provider 6.69.1 소스에서 `root_block_device.volume_size` 에 ForceNew 가 없다. 바뀌면 `ModifyVolume` 에 그 크기를 그대로 넘긴다. 그래서 줄인 값도 plan 은 늘릴 때와 같은 모양(`1 to change`)으로 나온다. 실패는 apply 때 난다. 새 run 에 `command = plan` 을 적는다
- 체크칸 결과는 로그에 실제로 남은 것만(Grafana 화면 확인 기록은 없음)
- SSOT 8절 새 줄을 짧게 — 「steal 이 줄지 않았다」는 9 · 10절을 가리키기만. 판단 기준 한 줄을 더한다
- 글: 「HANDOFF」 같은 팀이 모르는 이름을 뺌, 쉼표 · 수 표기

## MR 전 리뷰에서 바뀐 것 (reviewer 조수 2026-11-02, 「고쳐야 함」 1 · 선택 반영)

- **고쳐야 함 — README 새 절의 상태 문장이 되돌리는 목록에서 빠짐:** 「관리 서버는 2026-11-02 부터 unlimited 다 · 8절에서 정한다」는 되돌리면 틀린 말이 된다. 8절 줄을 지우면 빈 곳을 가리킨다. 상태는 SSOT 6절에 이미 있다(약속 4) → 상태 문장을 빼고 「지금 설정과 이유는 `SSOT.md` 6 · 9절」로
- 함정 문장을 「초과 크레딧 잔액이 0 보다 크면 두 가지가 같이 온다」로 좁힘(초과 0 · 잔액 0 이면 기준선만 온다). apply 직전에 다시 보기 · 「머지한 코드로 plan」 순서 · 패널 실제 이름 「노드 CPU 사용 (코어)」 · 초과 크레딧 풀이를 처음 나오는 곳에
- SSOT 8절 판단 기준에 「최솟값으로 본다」
- 오늘 낮 계획 체크칸 결과를 할 일과 줄을 나눠 적음. `apply -k` 명령은 기록에 없어 diff 출력 · 사이드카 로그로 확인했다고 적음

## 머지 뒤 재리뷰에서 바뀐 것 (reviewer 조수 2026-11-02, 「통과」 · 선택 반영, 뒤이은 MR)

- README 절차를 다시 짬: 함정을 0번 아래 줄로 옮겨 README 0 ~ 4 가 아래 「바꿀 파일」의 0 ~ 4 와 다시 같아짐. 대시보드 적용이 5번으로 더해짐. 대시보드 서버 적용을 확인 뒤로 옮김 — apply 를 미루면 그동안 문서와 대시보드만 standard 가 되므로. 3번에 「조건이 안 맞으면 미룬다 · 오래 두지 않는다」. 1번 목록에 「이 절」
- 「기준선까지 서서히」에 원문 조건(기준선보다 많이 쓰고 있을 때)과 「기준선」 풀이
- 초과 크레딧 잔액을 어디서 보는지 — SSOT 6절 「CloudWatch 는 쓰지 않는다」와 부딪치지 않게, EC2 콘솔 그래프는 미확인 · AWS 문서는 CloudWatch 콘솔 안내 · 쓸지는 SSOT 6절로
- 작업 순서 체크칸 채움, 쉼표

## AWS 문서로 확인한 것 (2026-11-02)

티켓에 적은 함정 두 문장 중 하나는 문서와 다르다.

| 티켓 문장 | 문서 | 판정 |
|---|---|---|
| 되돌리는 순간 넘게 쓴 크레딧이 청구된다 | unlimited 를 standard 로 바꾸면 `CPUCreditBalance` 는 그대로 넘어가고 `CPUSurplusCreditBalance` 는 바로 청구된다 | 맞음. 청구되는 것은 초과로 쓰고 아직 갚지 않은 크레딧이다 |
| 남은 크레딧이 0 이면 바로 기준선으로 묶인다 | standard 에서 쌓인 크레딧이 없으면 기준선까지 「서서히(gradually)」 내려온다. 다시 쌓일 때까지 기준선을 넘지 못한다 | **「바로」가 틀림** → 「서서히」로 적는다. 몇 분에 걸치는지는 문서에 없어 쓰지 않는다 |

- unlimited 계산식에서는 초과 크레딧 잔액이 0 보다 크면 `CPUCreditBalance` 가 0 이다. 그래서 두 함정은 같이 온다. 초과분이 청구되는 순간 잔액 0 이 그대로 넘어가 서서히 기준선으로 내려온다
- 기준선 아래로 쓰는 동안에는 크레딧을 쌓기 전에 초과 크레딧부터 갚는다. 한가한 때를 기다리면 초과 크레딧 잔액이 0 이 된다
- 두 값은 CloudWatch 지표(5분마다 갱신)다. apply 키에는 CloudWatch 권한이 없어 콘솔에서 사람이 본다
- 출처(AWS EC2 사용 설명서): 「Unlimited mode concepts for burstable instances」의 「What happens to credits when switching between Unlimited and Standard」 · 「Surplus credits can incur charges」, 「Key concepts for burstable performance instances」, 「Monitor CPU credits for burstable instances」의 「Calculate CPU credit usage for Unlimited instances」

## 바꿀 파일

**`infra/README.md`** — 「루트 디스크 늘리기」 뒤에 새 절 「CPU 크레딧 standard 로 되돌리기 (Jira S15P31A102-149)」. 서버를 멈추지 않는다(문서: 실행 중이거나 멈춘 인스턴스에서 언제든 바꿀 수 있다)

0. 콘솔에서 「CPU 크레딧 밸런스」(`CPUCreditBalance`)와 초과 크레딧 잔액(`CPUSurplusCreditBalance`)을 본다. 초과 크레딧 잔액이 0 이고 크레딧 잔액이 넉넉할 때 바꾼다. 그렇지 않으면 위 함정 두 가지가 같이 온다 — 함정 두 줄 · 출처를 이 단계에 적는다
1. 한 MR 에 함께 바꾼다
   - `compute.tf` 의 `cpu_credits` 와 그 위 주석, `tests/security_group.tftest.hcl` 의 같은 단언과 오류 문구
   - `SSOT.md` 6절 서버 줄 · CPU 크레딧 줄, 9절에 뒤집은 줄 하나, 8절의 이 줄 지우기
   - `infra/k8s/bootstrap/ci-exporter/ci-dashboard.json` 「노드 CPU 사용」 설명 — 머지 뒤 서버에서 다시 적용(`infra/server/README.md` 「CI 잡 지표」)
2. plan 이 `aws_instance.control_plane` 하나를 제자리에서 바꾸는지(`1 to change`, `cpu_credits` 만) 본다. 149 때도 그랬다(MR !509). `must be replaced` 가 나오면 멈춘다
3. apply — apply 키에 `ec2:ModifyInstanceCreditSpecification` 이 있다
4. 확인 — `aws ec2 describe-instance-credit-specifications` 한 줄(인스턴스 ID 는 `terraform output -raw control_plane_instance_id`, `--profile newlearn-apply`)이 `standard`

「루트 디스크 늘리기」 1번은 「`root_volume_gb` 기본값과 `validation` 하한을 같이 올리고 MR 로 머지한다」로 ㉠

**`SSOT.md` 8절** — 새 줄

| 항목 | 누가 | 관련 |
|---|---|---|
| 관리 서버 CPU 크레딧을 unlimited 로 둘지 standard 로 되돌릴지 — 왜 열려 있는지는 9 · 10절(2026-11-02). 사용자가 EC2 콘솔 「CPU 크레딧 밸런스」 1주를 보고 발표(11-18) 전에 정한다. 1주 동안 잔액이 0 에 닿은 적이 없으면 standard 였어도 묶이지 않았다는 뜻이다. 되돌리는 법 · 함정은 `infra/README.md` 「CPU 크레딧 standard 로 되돌리기」 | Infra | 6절, 9절, 10절, Jira S15P31A102-149 |

**`infra/terraform/compute.tf`** — 크레딧 주석 끝에 한 줄: 되돌리는 법 · 함정은 `infra/README.md` 「CPU 크레딧 standard 로 되돌리기」

**`infra/terraform/tests/security_group.tftest.hcl`**
- 크레딧 단언 오류 문구 → 「T3 CPU 크레딧은 unlimited — standard 는 크레딧이 바닥나면 기준선으로 묶인다 (Jira S15P31A102-149)」. 「CI · 컨트롤 플레인이 느려진다」 단정과 「vCPU 당 30%」를 뺀다
- 새 run 「루트_디스크는_줄일_수_없다」 — `command = plan`, `variables { root_volume_gb = 30 }`, `expect_failures = [var.root_volume_gb]`. 기존 두 시험(`admin_cidrs` · `backup_bucket_name`)과 같은 모양 ㉠

**`infra/terraform/variables.tf`** ㉠
- `root_volume_gb` 에 `validation` — `condition = var.root_volume_gb >= 50`, 오류 문구 「루트 디스크(EBS)는 줄일 수 없다 — 지금 크기보다 작은 값은 넣지 않는다.」(숫자 없음, 기존 문구처럼 마침표)
- 위 주석 「늘리기만 된다 — 하는 법은 …」 → 「늘릴 때는 default 와 validation 하한을 같이 올린다 — 하는 법은 `infra/README.md` 「루트 디스크 늘리기」」(오류 문구와 같은 말을 두 번 하지 않게)

**`infra/server/alerts.md`** 디스크 절 4번 — 「2026-11-02 30 → 50GiB (Jira S15P31A102-146)」 → 「지금 크기는 `infra/terraform/variables.tf` 의 `root_volume_gb`」

**`docs/plans/2026-11-02-doc-drift-cleanup.md`** — 빈 체크칸 세 개를 `[x]` 로, 줄 끝에 결과
- MR B — !513 infra 머지(2026-11-02 15:57 KST)
- infra → dev !514(`1bebacd6`). 분야 브랜치는 계획의 「셋」이 아니라 네 개(infra · backend · ai · frontend, !515 ~ !518). Jira 149 · 150 완료
- 대시보드 — `kubectl diff -k` 로 ConfigMap 하나만 바뀌는 것을 본 뒤(07:03 UTC) `apply -k`, Grafana 사이드카가 대시보드를 다시 읽음(07:04:29 UTC). 화면 확인 기록은 없음

**이 계획 파일**

### `validation` 을 넣는 이유 ㉠

- 막는 것: `terraform.tfvars` 에 옛 값(예: 30)을 넣은 채 plan 하는 실수. provider 가 줄인 크기를 그대로 `ModifyVolume` 에 넘겨서, plan 은 늘릴 때와 같은 `1 to change` 로 보이고 실패는 apply 때 난다(AWS 가 내는 오류 문구는 확인하지 않음). 검사가 있으면 plan 에서 멈춘다
- 대가: 변수 검사는 지금 디스크 크기를 모른다. 그래서 하한 50 을 기본값 옆에 한 번 더 적는다(약속 4 와 부딪침). 늘릴 때 둘을 같이 올려야 한다
- 따로 검사를 만들지 않는 이유: 위험한 쪽(기본값을 하한 아래로 내림)은 모든 plan 시험이 검사에 걸려 저절로 잡힌다. 하한 올리기를 잊으면 줄이기를 덜 막을 뿐 막히는 일은 없다

## 작업 순서

- [x] 시험 먼저 ㉠ — 새 run 을 넣고 `terraform test` 가 그 run 에서 실패하는지(기대한 실패가 안 남) 본 뒤 `validation` 을 넣어 통과
- [x] 문서 · 주석 · 시험 문구 → infra 게이트 · `terraform test` → MR reviewer → MR → infra 머지
  - 결과: !524 infra 머지(`564c3a85`). MR 전 리뷰 「고쳐야 함」 1 반영
- [x] infra → dev → 분야 브랜치 네 개 맞추기(내용 차이부터) → `/feature-done` → Jira 151 완료
  - 결과: !525 dev 머지(`1d9bb6b3`). 맞추기 !526 backend · !527 ai · !528 frontend. infra 는 내용이 dev 와 같아 맞추기 MR 을 만들지 않음. `/feature-done` 의 재리뷰 「통과」, 선택은 뒤이은 MR 로 반영

## 안 바꿀 것

- 실제 크레딧 설정 — unlimited 그대로다. 되돌리기는 하지 않는다. 둘지는 사용자가 그래프를 보고 정한다
- SSOT 6절 서버 줄 · 크레딧 줄, 9절 149 줄, 10절 — 지금 상태로는 맞다. 되돌리는 법은 8절 새 줄이 README 를 가리킨다
- `compute.tf` 주석의 「기준선(vCPU 당 30%)」 · 대시보드 설명 — 지금 상태로는 맞다
- `variables.tf` 의 「2026-11-02 30 → 50」 — 바뀐 자리의 기록이라 남긴다
- 옛 계획 문서(`docs/plans/2026-10-18-…` 의 30GiB 등) · 그날 잰 값
- 다른 열린 일: t3.xlarge 로 올리기, 스냅샷 `jira-146-before-50gib` 지우기, README 의 「루트 계정」 문장, 커밋 제목 「(Jira N)」 표기, 대시보드 「전체 코어」 식, `stack.md` L3 「`/api` 401」

## 리스크

- `validation` 이 사용자 PC 의 `terraform.tfvars` 에 걸릴 수 있다 ㉠ — 본 작업 폴더의 tfvars 에 `root_volume_gb` 줄이 없다(reviewer 조수가 줄 수만 셈, 값은 안 읽음). 기본값 50 이 쓰여 걸리지 않는다
- 그 밖에는 문서 · 주석 · 시험 문구다. 사이트 · Argo CD 에 영향이 없다(`infra/server/alerts.md` 는 Argo CD 가 보는 폴더가 아니다)

## 어떻게 검증하나

- `terraform test` — 새 run 이 `validation` 을 넣기 전에는 실패하고 넣은 뒤 통과한다 ㉠. 문구만 바뀐 크레딧 run 도 통과한다
- infra 게이트(`.claude/stack.md` §3 `infra_FORMAT_CHECK` · `infra_LINT` · `infra_TEST`) — 커밋 훅
- grep — tftest 에 「느려진다」 없음, `alerts.md` 에 「30 → 50」 없음, `2026-11-02-doc-drift-cleanup.md` 에 `[ ]` 없음
- 되돌리는 법의 문장마다 AWS 문서 출처가 붙었는지, 1번 목록이 지금 「unlimited」가 적힌 곳을 모두 담는지(`grep -rn unlimited`) — MR reviewer
- MR 파이프라인 success 뒤에만 머지(`w0` · `w12:infra`)
- 되돌리는 절차 자체는 돌리지 않는다. 2번의 plan 모양은 149 반영 때의 실제 plan(standard → unlimited, MR !509)을 근거로 쓴다

## 되돌리는 법

- 문서 · 주석 · 시험 · 변수 검사만 바뀐다 — MR 을 revert 하면 끝난다. AWS 자원은 건드리지 않는다
