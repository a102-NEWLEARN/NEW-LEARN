# DB 백업 — 매일 관리 서버 (pg_dump)

CronJob `postgres-backup`(`infra/k8s/services/data/postgres-backup.yaml`)이 매일 04:00(한국) 관리 서버에 떠서 `postgres.data.svc` 의 `newlearn` DB 를 덤프한다(Jira S15P31A102-109). 파일은 관리 서버 `/var/lib/newlearn/pg-backup/newlearn-YYYYMMDD-HHMM.dump`(`pg_dump -Fc`)이고, 7일 넘은 것은 잡이 지운다. DB(워커)와 다른 서버에 두어 워커를 잃어도 남는다.

백업에는 회원 정보가 들어 있다 — 폴더는 0700, PC 로 가져온 파일은 저장소 · 공유 폴더에 두지 않고 쓰고 나면 지운다.

**처음 한 번** (EC2, 매니페스트를 dev 에 머지하기 **전에** — PV 가 먼저 있어야 PVC 가 바로 묶인다)

```bash
sudo install -d -m 0700 -o 999 -g 999 /var/lib/newlearn/pg-backup   # postgres 이미지 사용자만. EC2 에서 gid 999 는 systemd-journal 이지만 0700 이라 그룹은 못 읽는다
kubectl apply -f infra/k8s/bootstrap/pg-backup-pv.yaml
```

**확인 · 손으로 돌리기** (EC2) — 마지막 성공이 오래되면(매일 26시간 · 주간 8일) Mattermost 로 경보가 온다(`NewlearnBackupMissing`, `infra/server/alerts.md`). 경보가 오면 이것으로 본다

```bash
kubectl -n data get cronjob postgres-backup           # 마지막 실행 · 다음 실행
kubectl -n data get jobs                              # 성공 · 실패 3개씩 남는다 (data 에는 백업 잡만 있다)
sudo ls -lh /var/lib/newlearn/pg-backup               # 하루 하나. .part 가 남아 있으면 그날 실패
df -h /                                               # 관리 서버 디스크
kubectl -n data create job --from=cronjob/postgres-backup postgres-backup-manual-$(date +%m%d%H%M)   # 마이그레이션 같은 위험한 작업 전에 한 번 더
kubectl -n data logs job/<잡 이름>                    # 끝에 남긴 파일 이름 · 크기
```

**PC 로 가져오기** (관리자 PC — 위험한 작업 전 · `terraform destroy` 전)

```bash
ssh ubuntu@<EC2 탄력적 IP> "sudo cat /var/lib/newlearn/pg-backup/<파일>" > <파일>
```

**되살리기 연습** (EC2 — 사이트에 영향 없다. 백업이 정말 되살아나는지 가끔 본다)

```bash
f=/var/lib/newlearn/pg-backup/<파일>
kubectl -n data exec postgres-0 -- createdb -U newlearn newlearn_restore_check
sudo cat "$f" | kubectl -n data exec -i postgres-0 -- pg_restore -U newlearn -d newlearn_restore_check --no-owner
# 표마다 행 수를 원본과 견준다 — 덤프 뒤에 원본에 들어온 행만큼은 다를 수 있다
q="select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text from information_schema.tables where table_schema = 'public' order by 1"
for d in newlearn newlearn_restore_check; do kubectl -n data exec postgres-0 -- psql -U newlearn -d "$d" -Atc "$q" > "/tmp/rows-$d"; done
diff /tmp/rows-newlearn /tmp/rows-newlearn_restore_check && echo "행 수 같음"
kubectl -n data exec postgres-0 -- dropdb -U newlearn newlearn_restore_check
```

**사고 때 되살리기** (EC2 — 사람이 정하고 한다)

1. 위 연습과 같은 방법으로 `newlearn_restored` 에 되살리고 행 수를 본다
2. 지금 DB 를 옆으로 치우고 되살린 DB 를 그 이름으로 바꾼다. 연결을 먼저 막아 backend 가 그 사이에 다시 붙지 못하게 한다

   ```bash
   kubectl -n data exec -i postgres-0 -- psql -U newlearn -d postgres <<'SQL'
   ALTER DATABASE newlearn WITH ALLOW_CONNECTIONS false;
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'newlearn';
   ALTER DATABASE newlearn RENAME TO newlearn_broken_YYYYMMDD;
   ALTER DATABASE newlearn_restored RENAME TO newlearn;
   SQL
   ```

3. `curl -fsS https://newlearn.io.kr/actuator/health` 와 `kubectl -n app logs deploy/backend --since=5m` 으로 본다. backend 는 연결이 끊긴 뒤 새 DB 로 다시 붙을 것으로 본다(이름 바꾸기는 연습하지 않아 미확인 — 안 붙으면 `kubectl -n app rollout restart deploy/backend`)
4. 치운 DB(`newlearn_broken_…`)는 지우지 않고 남긴다. 지우는 것은 사람이 정한다(`dropdb`)

- 덤프 시각 뒤에 들어간 Flyway 마이그레이션은 되살린 DB 에 없다 — backend 를 다시 띄우면 그 마이그레이션이 다시 돈다
- 워커를 통째로 잃었으면 새 워커를 붙이고(`infra/server/README.md` 「Lightsail」) data 앱이 빈 DB 를 띄운 뒤 같은 방법으로 되살린다

## 매주 S3 사본

CronJob `postgres-backup-s3`(같은 파일)가 매주 일요일 05:00(한국) 그날 가장 새 매일 백업 하나를 `s3://<버킷>/postgres/` 에 올린다. 이틀 안의 매일 백업이 없으면 실패로 남는다. 버전 관리를 켜 두어 덮어쓰거나 지운 백업도 이전 판이 남는다 — 보관 기간과 올리기 키 조건은 `SSOT.md` 6절 「백업」(Jira S15P31A102-147). 35일이 지난 백업은 삭제 표시에 가려 `aws s3 ls` 에는 안 보이고 아래 `list-object-versions` 에만 보인다. 올리는 키는 올리기만 되고, 받기는 apply 키(`newlearn-apply` 프로필)로 한다. 버킷 · 키를 처음 만드는 순서는 `infra/README.md` 「DB 백업 버킷 · 올리는 키」.

**확인 · 손으로 돌리기**

```bash
kubectl -n data create job --from=cronjob/postgres-backup-s3 postgres-backup-s3-manual-$(date +%m%d%H%M)   # EC2. 로그 끝에 올린 주소 · 크기 · sha256
aws s3 ls s3://<버킷>/postgres/ --profile newlearn-apply                                               # 관리자 PC
aws s3api list-object-versions --bucket <버킷> --prefix postgres/ --profile newlearn-apply             # 판마다 VersionId · 지금 판(IsLatest) · 삭제 표시
```

**이전 판 받기** (관리자 PC) — 같은 이름으로 덮어써졌거나 지워진 백업. 위 목록에서 `VersionId` 를 고른다

```bash
aws s3api get-object --bucket <버킷> --key postgres/<파일> --version-id <VersionId> <파일> --profile newlearn-apply
```

**S3 에서 받아 되살리기** (관리자 PC) — 받은 파일을 관리 서버를 거쳐 그대로 넣는다. 그다음은 위 「되살리기 연습」 · 「사고 때」와 같다

```bash
aws s3 cp s3://<버킷>/postgres/<파일> . --profile newlearn-apply
ssh ubuntu@<EC2 탄력적 IP> "kubectl -n data exec postgres-0 -- createdb -U newlearn newlearn_restored"
ssh ubuntu@<EC2 탄력적 IP> "kubectl -n data exec -i postgres-0 -- pg_restore -U newlearn -d newlearn_restored --no-owner" < <파일>
```
