# 백업 버킷 버전 관리 · 올리기 키 IP 조건 (Jira 새 티켓)

## 무엇을 / 왜

SAA-C03 자료 대조(2026-11-02)에서 찾은 실제 빈틈을 막는다. 주간 백업 버킷에 버전 관리가 없고, 올리기 키가 `postgres/*` 에 조건 없이 `PutObject` 를 가져 **같은 이름으로 올리면 기존 백업을 덮어쓸 수 있다**(키 이름은 `newlearn-YYYYMMDD-HHMM.dump` 로 짐작 가능). 버전 관리를 켜 덮어쓰기 · 콘솔 실수 삭제에도 이전 판이 남게 하고, 키를 관리 서버 밖에서는 못 쓰게 한다. 같은 MR 에서 오늘 `infra/README.md` 에 잘못 쓴 「EBS 6시간 규칙」도 바로잡는다.

## 바꿀 파일

- `infra/terraform/tests/backup.tftest.hcl` — **먼저** 실패하는 시험: 버전 관리 `Enabled`, 이전 판 35일 뒤 지움, 남은 삭제 표시 정리 규칙
- `infra/terraform/backup.tf` — `aws_s3_bucket_versioning`(Enabled), 수명 규칙에 `noncurrent_version_expiration { noncurrent_days = 35 }` 추가, 남은 삭제 표시를 치우는 규칙 하나 더(`expired_object_delete_marker = true` 는 `days` 와 한 규칙에 못 둠), 수명 규칙에 `depends_on` 버전 관리
- `infra/terraform/iam/apply-policy.json` — PgBackupBucket 에 `s3:PutBucketVersioning` · `s3:ListBucketVersions`, PgBackupObjectsRead 에 `s3:GetObjectVersion`(이전 판 받기). 지우기 권한은 여전히 주지 않음
- `infra/terraform/iam/pg-backup-uploader-policy.json` — `Condition: IpAddress aws:SourceIp` 에 자리표시 `<관리 서버 탄력적 IP>/32`. 저장소에 IP 를 적지 않는 관례대로, 실제 값은 콘솔에 넣을 때 `terraform output control_plane_public_ip` 로 채움
- `infra/README.md` — 「DB 백업 버킷」 절(정책 고치기 · IP 채우기 · 「키가 샜으면」 문장), destroy 줄(「버전까지 비우고」), 「루트 디스크 늘리기」의 6시간 문장 → 「앞 변경이 completed 가 된 뒤, 24시간에 최대 4번」
- `infra/server/db-backup.md` — 「매주 S3 사본」에 이전 판 보기 · 받기(`aws s3api list-object-versions` · `get-object --version-id`)
- `infra/k8s/services/data/postgres-backup.yaml` — 머리 주석 「이 키로는 백업을 읽거나 지울 수 없다」에 「관리 서버 IP 에서만」 덧붙임(주석만, 동작 그대로)
- `SSOT.md` 6절 백업 줄 — 버전 관리 · 이전 판 35일 · 올리기 키 IP 조건
- `docs/plans/2026-11-02-backup-versioning.md` — 이 계획(승인 뒤 같은 MR 에)

## 안 바꿀 것

- 올리기 CronJob 의 동작 · 일정(매주 일요일 05:00) · 키 이름 규칙
- 현재 판 35일 만료 · 공개 막기 · `force_destroy = false`
- 올리기 키에 지우기 · 읽기 권한을 주지 않음, 키를 EC2 역할(인스턴스 프로필)로 바꾸지 않음
- Object Lock · 다른 리전 복제 · S3 게이트웨이 엔드포인트(조사에서 하지 않기로 함)
- 나머지 SAA 후보(EBS 스냅샷 자동화 · 바깥 죽음 감지 등) — 따로 정함

## 리스크

- **IP 조건이 틀리면 주간 올리기가 막힌다.** Pod 의 S3 요청이 관리 서버 탄력적 IP 로 나간다고 봄(Cilium 이 노드 IP 로 바꾸고 → 인터넷 게이트웨이가 탄력적 IP 로 바꿈, 실측 없음). 콘솔 정책을 바꾼 직후 잡을 손으로 돌려 확인하고, 막히면 조건을 바로 뺀다. 놓쳐도 8일 뒤 `NewlearnBackupMissing` 경보가 옴
- 버전 관리는 **한 번 켜면 끌 수 없고 「일시 중지」만 된다**(S3 규칙). 이전 판은 35일 뒤 수명 규칙이 지우므로 쌓이지 않음
- 정상 백업도 35일 + 35일 = 약 70일 남아 저장 용량이 두 배가 될 수 있음(덤프가 작아 금액은 미미할 것으로 추측, 크기 미측정)
- destroy 때 버킷을 비우려면 이전 판까지 지워야 함 — 콘솔 「비우기」가 모든 판을 지움(README 에 적음)
- apply 정책 · 올리기 정책은 사람이 콘솔에서 바꿈 — 저장소와 어긋날 수 있음(README 절차로 맞춤)

## 어떻게 검증하나

1. `terraform test` — 새 시험이 구현 전에는 단언에서 실패하고, 구현 뒤 통과(커밋 게이트 · CI `w12:infra`)
2. `terraform plan` — 「1 to add, 1 to change, 0 to destroy」(버전 관리 추가 · 수명 규칙 제자리 변경)만 나오는지
3. 사람: 콘솔에서 apply 정책 · 올리기 정책 반영 → 저장한 plan 으로 apply
4. 읽기 확인: `aws s3api get-bucket-versioning`(Enabled), `get-bucket-lifecycle-configuration`(규칙 둘)
5. **실제 올리기**: 사람이 `kubectl -n data create job --from=cronjob/postgres-backup-s3 …` → 잡 성공 · 로그의 주소 · 크기 · sha256, `aws s3api list-object-versions` 에 새 판(VersionId 있음)
6. (가능하면) IAM 정책 시뮬레이터로 다른 IP 에서 `PutObject` 가 거절되는지 — 못 하면 「확인 못 함」으로 적음

## 되돌리는 법

- IP 조건: 콘솔에서 올리기 정책의 이전 판(정책 버전)으로 되돌리면 바로 풀림
- 코드: MR revert. 단 🔴 **버전 관리는 끌 수 없어** revert 하면 「일시 중지」가 아니라 Terraform 이 자원만 잊음 — 되돌릴 때는 `status = "Suspended"` 로 바꾸는 MR 을 따로 냄. 이전 판은 수명 규칙(또는 콘솔)이 지움
- apply 정책: IAM 「정책 버전」에서 이전 판으로
