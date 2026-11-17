#!/usr/bin/env bash
# postgres_exporter 의 DB 역할 newlearn_monitor 와 비밀번호 Secret 만들기 (Jira S15P31A102-189)
# 역할에는 pg_monitor 와 분석 작업 표(analysis_job)의 여섯 칸 SELECT 를 준다 — 경보 질의 queries.yaml 용 (Jira S15P31A102-215)
# 🔴 DB 권한을 주는 스크립트다 — 바꾸면 사람이 최종 확인한다(AGENTS.md 「인증 · 권한 코드」)
# 어디서: 관리 서버(EC2), 저장소 루트에서 사람이 친다 — bash infra/k8s/bootstrap/pg-exporter/make-secret.sh
# 다시 돌려도 된다: 역할은 없을 때만 만들고, 비밀번호를 새로 정해 Secret 을 바꾼 뒤 exporter 가 있으면 다시 띄운다
#
# 비밀번호 평문은 이 스크립트의 변수와 파이프에만 있다. 화면 · 명령 줄 · 프로세스 목록 · 저장소 · DB 로그 어디에도 남지 않게 한다
#   - DB 에는 평문 대신 SCRAM-SHA-256 값(verifier)만 보낸다 — PostgreSQL 은 이미 암호화된 값을 그대로 저장한다(ALTER ROLE 문서)
#   - 그 psql 세션만 문장 기록을 끈다 — 오류가 나면 문장 전체가 DB 로그에 남고, DB 로그는 Loki 로 가서 14일 남는다(alloy-values.yaml)
#   - Secret 은 /dev/stdin 으로 만든다(infra/server/README.md 의 기존 방식)
set -euo pipefail
umask 077

for cmd in python3 kubectl; do
    command -v "$cmd" >/dev/null || { echo "$cmd 가 없다" >&2; exit 1; }
done

PW=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
# RFC 5802 · 7677 SCRAM-SHA-256 — PostgreSQL 이 저장하는 모양: SCRAM-SHA-256$<반복>:<소금>$<StoredKey>:<ServerKey>
VERIFIER=$(printf '%s' "$PW" | python3 -c '
import base64, hashlib, hmac, os, sys
pw = sys.stdin.read().encode()
salt, it = os.urandom(16), 4096
salted = hashlib.pbkdf2_hmac("sha256", pw, salt, it)
stored = hashlib.sha256(hmac.new(salted, b"Client Key", hashlib.sha256).digest()).digest()
server = hmac.new(salted, b"Server Key", hashlib.sha256).digest()
b64 = lambda x: base64.b64encode(x).decode()
print(f"SCRAM-SHA-256${it}:{b64(salt)}${b64(stored)}:{b64(server)}")
')

# 문장은 stdin 으로 넘긴다(명령 줄에 값이 없다). 세 set 은 이 세션에만 적용된다(슈퍼유저 newlearn 이라 바꿀 수 있다)
kubectl -n data exec -i postgres-0 -- psql -X -q -v ON_ERROR_STOP=1 -U newlearn -d newlearn <<SQL
set log_statement = 'none';
set log_min_error_statement = 'panic';
set log_min_duration_statement = -1;
do \$\$
begin
    if not exists (select from pg_roles where rolname = 'newlearn_monitor') then
        create role newlearn_monitor login connection limit 3;
    end if;
end
\$\$;
grant pg_monitor to newlearn_monitor;
-- 분석 작업 경보의 질의(queries.yaml)가 읽는 여섯 칸만 (Jira S15P31A102-215). result · error_message 같은 다른 칸은 주지 않는다.
-- 비밀번호를 바꾸기 전에 둔다 — 여기서 실패하면(표가 아직 없거나 칸 이름이 틀리면) 비밀번호 · Secret 이 그대로라 exporter 가 끊기지 않는다.
-- 표는 backend 마이그레이션(Flyway)이 만든다. 클러스터를 새로 지을 때는 backend 가 한 번 뜬 뒤에 이 스크립트를 돌린다
grant select (stage, status, retry_at, queued_at, error_code, candidates) on public.analysis_job to newlearn_monitor;
alter role newlearn_monitor password '${VERIFIER}';
SQL
unset VERIFIER

kubectl -n monitoring delete secret postgres-exporter --ignore-not-found >/dev/null
printf '%s' "$PW" | kubectl -n monitoring create secret generic postgres-exporter --from-file=password=/dev/stdin >/dev/null
unset PW

# 첫 실행 때는 아직 Deployment 가 없다(kubectl apply -k 가 다음 단계)
if kubectl -n monitoring get deploy postgres-exporter >/dev/null 2>&1; then
    kubectl -n monitoring rollout restart deploy/postgres-exporter >/dev/null
    echo "exporter 다시 띄움"
fi
echo "끝 — DB 역할 newlearn_monitor · Secret monitoring/postgres-exporter"
