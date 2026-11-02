# 11-02 저녁 점검 문서 어긋남 정리 · CPU unlimited 반영 기록 (Jira S15P31A102-149 · 150)

## 무엇을 / 왜

2026-11-02 저녁 점검에서 하네스 · SSOT 를 다시 읽고 문서 대조 조수를 돌려, 오늘 인프라 변경이 남긴 어긋남을 찾았다. SSOT 가 실제보다 단정하거나(「지우기 없음」 · 「IP 에서만 쓸 수 있다」), 같은 사실을 다섯 곳에 적었고(약속 4), 뒤집은 결정 · 옛 주석 · 스냅샷 안내가 빠졌다. 같은 김에 Jira 149(CPU 크레딧 unlimited)의 반영 뒤 비교를 기록한다. 서로 다른 일이라 MR 둘로 나누고 infra → dev 는 한 번만 한다.

## 계획에서 바뀐 것 (reviewer 조수 계획 리뷰 2026-11-02, 「고쳐야 함」 4 · 선택 7 반영)

- **stack.md §5 L2:** 「배포 판정 PostgreSQL 만」은 워커에 틀림 — 워커 readiness 는 `/health`(Redis ping, `infra/k8s/services/ai/ai.yaml` · `ai/app/main.py`). 222 줄도 10-28(Jira 29)부터 틀림(backend 는 `/actuator/health/readiness` · `/liveness`, 포트만 보는 것은 frontend · ai) → 두 줄을 같이 고침
- **대시보드 설명:** 「노드 CPU 사용」 패널은 두 노드의 합이고 워커(Lightsail)는 여전히 버스트형 → 「두 노드 합 · 관리 서버는 11-02 부터 unlimited · 워커는 버스트형」으로. 노드별로 나누는 식 변경은 따로(약속 3)
- **SSOT 174 · README 9 · 150:** 「Delete 계열 없음」도 부정확(`s3:DeleteBucket` 있음) → 「객체를 지우는 권한은 없다. 수명 규칙 · 버전 관리 설정은 바꿀 수 있어 그것으로 지울 수 있다」
- **검증:** `/feature-done`, MR A 리뷰, `w0:harness`(stack.md 변경), grep 조건 넓힘
- **추가 어긋남:** 9절 147 줄(35일 → 실제로 지워지기까지 약 70일), 10절 145 줄에도 「말하지 못하는 것」, 9절 146 줄의 「왜」
- **절차 문장은 남김:** 숫자(35 · 약 70일)와 IP 조건 요약만 SSOT 6절로 보내고, 절차 · 함정(게이트웨이 엔드포인트 → `aws:SourceVpce`, 같은 서버 CI 잡) · 코드가 왜 그런지(backup.tf)는 남김
- **MR 순서 · 충돌:** A 는 10절 맨 위 새 줄 하나만, 9절과 다른 줄은 손대지 않음. B 는 A 가 infra 에 머지된 뒤 그 위에서 만듦. 계획 파일은 A 에, B 가 체크칸을 채움
- **기타:** `ci-cache-pv.yaml` 은 숫자 대신 `variables.tf` 를 가리킴, README 디스크 절차에 스냅샷 찍기 · 지우기 둘 다(콘솔 · 되돌릴 수 없음), 대시보드 반영은 폴더 보내기 → `kubectl diff -k` → apply

## 바꿀 파일

**MR A — Jira 149 반영 기록** (브랜치 `docs/infra/S15P31A102-149-record`)
- `SSOT.md` 10절 맨 위 새 줄 — unlimited 전 · 뒤 관리 서버 steal. 「어떻게」에 PromQL(관리 서버 `nodename` 으로 거른 `node_cpu_seconds_total{mode="steal"}` 5분 rate 평균), 측정 창 시작 · 끝(UTC), apply 시각 출처(apply 직후 `describe-instance-credit-specifications` 05:35:19 UTC). 「말하지 못하는 것」(창마다 CI 부하가 다름, 넘게 쓴 요금은 결제 콘솔에서만, 크레딧 잔량 미확인) · 판정 — 잰 값: 전(04:35 ~ 05:35 UTC) steal 평균 10.6% · 최고 25.0% · CPU 30.3%, 뒤(05:36 ~ 06:36 UTC) 11.8% · 19.8% · 31.3% → 평균은 줄지 않아 「steal = 크레딧 묶임」 가설이 약해짐
- `infra/k8s/bootstrap/ci-exporter/ci-dashboard.json` — 「노드 CPU 사용 (코어)」 설명을 「두 노드 합 · 관리 서버는 2026-11-02 부터 unlimited(관리 서버 몫 steal 은 크레딧 묶임 아님) · 워커는 버스트형(steal 이 크레딧 바닥일 수 있음)」으로
- `docs/plans/2026-11-02-doc-drift-cleanup.md` — 이 계획

**MR B — Jira 150 문서 어긋남 정리** (브랜치 `docs/infra/S15P31A102-150-doc-drift`, A 머지 뒤 infra 에서)
- `SSOT.md`
  - 6절 자격 증명 줄(174) — 「객체를 지우는 권한은 없다. 수명 규칙 · 버전 관리 설정은 바꿀 수 있어 그것으로 지울 수 있다」
  - 6절 백업 줄(287) — 숫자(35 · 약 70일)는 여기 하나로, IP 는 「관리 서버 탄력적 IP 조건을 건다(확인 범위는 10절)」
  - 9절 — 146 루트 디스크 30 → 50GiB(10-18 사양, 왜: 70% · 경보 80% · 서버 추가 대신), 147 백업이 실제로 지워지기까지 35일 → 약 70일(10-25 결정, 왜: 버전 관리)
  - 10절 145 · 146 줄 — 「이 측정이 말하지 못하는 것」
  - 9절 149 줄의 「왜」 — 「크레딧이 바닥나 자주 묶였다」는 반영 뒤 실측(steal 평균 10.6% → 11.8%, 줄지 않음)과 맞지 않음 → 「steal 이 보여 크레딧 묶임으로 보고 켰으나 반영 뒤 steal 이 줄지 않아 원인은 확인 못 함(크레딧 잔량 미확인)」으로 바로잡음. 사용자가 EC2 콘솔 「CPU 크레딧 잔액」 그래프를 보면 그 결과를 함께
- `infra/README.md` — 폴더 표(9) · 백업 절(148 숫자는 SSOT 가리키기, 150 권한 문장, 160 단정 완화 · 함정 둘은 남김) · destroy 줄(125, 손으로 찍은 스냅샷도 콘솔에서 지우기) · 「루트 디스크 늘리기」에 스냅샷 찍기(콘솔 · 루트 계정, apply 키에 권한 없음) · 확인 뒤 지우기(되돌릴 수 없음)
- `infra/server/db-backup.md` 「매주 S3 사본」 — 숫자 · IP 단정만 SSOT 가리키기. 일정 · 「이틀 안 매일 백업 없으면 실패」 · 「받기는 apply 키」 · 「35일 지난 백업은 `aws s3 ls` 에 안 보이고 `list-object-versions` 에만」은 남김
- `infra/k8s/services/data/postgres-backup.yaml` 머리 주석 — 보관 기간 · 70일은 빼고 backup.tf · SSOT 6절을 가리킴. 「키가 PutObject 만이라 `cp` 만 씀」 · 「관리 서버에서만 돌아야 함 — 키에 관리 서버 IP 조건」은 남김(동작 그대로)
- `infra/terraform/compute.tf` 주석 — 「크레딧이 바닥나 묶여 느려졌다(7일 steal …)」 단정을 9절 149 줄과 같은 뜻으로 바로잡음(MR A 리뷰에서 나옴, 주석만)
- `infra/terraform/backup.tf` 주석 — 코드가 왜 그런지(35일 까닭 · Suspended 만 · 만료는 삭제 표시만 · depends_on · 규칙 둘)는 남기고, 「35일 남긴다」와 다음 줄의 바로잡기만 한 문장으로(「약 70일」 낱말은 넣지 않음)
- `infra/k8s/bootstrap/ci-cache-pv.yaml` — 주석 「관리 서버 디스크 30 GiB」 → `infra/terraform/variables.tf` 의 `root_volume_gb` 를 가리킴
- `.claude/stack.md` §5 L2(222 · 223) — backend readiness `/actuator/health/readiness`(PostgreSQL, Jira 145) · liveness `/actuator/health/liveness`, 워커 readiness `/health`(Redis ping), 포트만 보는 liveness 는 frontend · ai
- `docs/plans/2026-11-02-disk-headroom.md` — 마지막 체크칸 `[x]`(SSOT 10절 !474 · 맞추기 !475 ~ !478 · Jira 141 완료 · Jira 115 설명 칸 [x] 확인함)
- 이 계획 파일의 체크칸

## 작업 순서

- [x] MR A: 관리 서버 steal 측정(창 · 식 기록) → 10절 맨 위 줄 · 대시보드 설명 → reviewer → MR → infra 머지
- [ ] MR B: A 머지된 infra 에서 브랜치 → 고치기 → grep · `terraform plan` → reviewer → MR → infra 머지
- [ ] infra → dev 한 번 → 분야 브랜치 셋 맞추기 → `/feature-done` → Jira 149 · 150 완료
- [ ] 사용자: dev 머지 커밋의 `infra/k8s/bootstrap/ci-exporter` 를 서버로 보내 `kubectl diff -k` 로 대시보드 ConfigMap 만 바뀌는지 본 뒤 `kubectl apply -k` → Grafana 에서 설명 확인 — 파일 카드로

## 안 바꿀 것

- Terraform 자원 · IAM 정책 · 매니페스트의 동작(주석 · 문서만)
- 커밋 제목의 「(Jira N)」 관행 — `stack.md` §3 주석과 팀 관행이 다름, 팀에 물을 일
- 곁 세션 계획 문서의 `zoo_docs` 언급 — 사용자 판단
- 146 · 149 계획 파일을 뒤늦게 만들지 않음
- 옛 승인 계획(`docs/plans/2026-10-18-…` 의 30GiB 등) · 그날 잰 값(「29G」 주석)
- 지나가다 본 것(이번에 안 고치고 하루 정리에 적음): 대시보드 「전체 코어」 식이 두 노드를 cpu 번호로 묶어 4 로 나옴, `stack.md` L3 의 「`/api` 401」(10-22 상태)

## 리스크

- `postgres-backup.yaml` 주석만 바꿔도 Argo CD `data` 앱이 다시 맞춘다 — 살아 있는 객체는 그대로
- 대시보드는 사용자가 다시 올려야 Grafana 에 보인다. `apply -k` 는 exporter Deployment 도 다시 적용하므로 `diff` 먼저(서버에서 손으로 바꾼 것이 있으면 덮어씀)
- `stack.md` 는 하네스 문서 — 편집할 때마다 사용자 허락(설정의 ask), CI 에서 `w0:harness` 가 돈다. §3 블록은 건드리지 않음
- 중복을 줄이다 절차에 필요한 문장을 빼면 안 됨 — 위 「남김」 목록으로 대조

## 어떻게 검증하나

1. 커밋 게이트(infra: fmt · validate · `terraform test` · promtool), CI `w12:infra` · `w0:harness`(B)
2. `terraform plan` 을 Claude 가 돌려 「No changes」(149 apply 뒤라 크레딧도 같음)
3. `python -m json.tool` 로 대시보드 JSON
4. grep(`docs/plans/` 는 빼고): 「지우기 없음」 · 「Delete 계열」 0건, `IP 에서만|IP 밖에서는` 이 단정으로 남지 않음, 「30 GiB」 0건, 「약 70일」은 SSOT 6 · 9 · 10절에만
5. reviewer 조수 — MR A · B 각각(남은 어긋남, 지운 문장이 절차에 필요한지, 10절 숫자 · 식)
6. `/feature-done`(149 · 150)
7. 머지 뒤 Argo CD 앱 모두 Synced · Healthy, 사용자 apply 뒤 Grafana 설명

## 되돌리는 법

- 두 MR 모두 문서 · 주석뿐이라 revert 로 끝남. 대시보드는 revert 커밋의 폴더를 보내 `diff` → `apply -k`
