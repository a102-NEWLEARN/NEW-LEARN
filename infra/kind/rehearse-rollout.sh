#!/usr/bin/env bash
# 무중단 교체 · 되돌리기 리허설
# hello v1 → v2 를 Git(로컬 미러)에 커밋해 Argo CD 로 반영하고, git revert 로 v1 에 돌아온다
# 그동안 요청을 계속 보내 실패 수와 걸린 시간을 잰다. up.sh 뒤에 돌린다
set -euo pipefail
. "$(dirname "$0")/lib.sh"

need kubectl git curl
guard
WORK="$MIRROR_DIR/work"
DEPLOY="$WORK/infra/k8s/hello/deployment.yaml"
OUT="$(mktemp)"
STOP="$(mktemp)"
CODE="$(mktemp)"
BODY="$(mktemp)"
LOAD_PID=""

# 어디서 멈추든 요청 반복을 끝내고 임시 파일을 지운다
# (& 로 띄운 반복은 Ctrl+C 를 무시하므로 STOP 파일과 kill 로 끝낸다)
cleanup() {
  rm -f "$STOP"
  [ -n "$LOAD_PID" ] && kill "$LOAD_PID" 2>/dev/null || true
  rm -f "$OUT" "$CODE" "$BODY"
}
trap cleanup EXIT INT TERM

git_rehearsal() { git -C "$WORK" -c user.name=kind-rehearsal -c user.email=kind@localhost "$@"; }
body() { curl -sS --max-time 2 "$HTTP_URL" 2>/dev/null | tr -d '\r\n' || true; }

# 요청을 쉬지 않고 보낸다. 한 줄에 「HTTP코드 본문」
load() {
  while [ -f "$STOP" ]; do
    curl -s -o "$BODY" -w '%{http_code}' --max-time 2 "$HTTP_URL" 2>/dev/null >"$CODE" || true
    printf '%s %s\n' "$(cat "$CODE")" "$(tr -d '\r\n' <"$BODY" 2>/dev/null)" >>"$OUT"
  done
}

push_refresh() {
  git -C "$WORK" push -q origin "HEAD:refs/heads/$REVISION"
  kubectl -n argocd annotate application hello argocd.argoproj.io/refresh=hard --overwrite >/dev/null
}

# 응답이 연달아 20번 $1 이고 교체가 끝날 때까지 기다린다
wait_for() {
  local streak=0
  for _ in $(seq 1 600); do
    if [ "$(body)" = "$1" ]; then streak=$((streak + 1)); else streak=0; fi
    [ "$streak" -ge 20 ] && break
    sleep 0.2
  done
  [ "$streak" -ge 20 ] || { echo "❌ 「$1」 응답이 안 나온다" >&2; exit 1; }
  kubectl -n hello rollout status deploy/hello --timeout=3m >/dev/null
}

[ "$(body)" = "hello v1" ] || { echo "❌ 지금 응답이 hello v1 이 아니다: $(body)" >&2; exit 1; }

load &
LOAD_PID=$!

log "v1 → v2 (Git 커밋 → Argo CD 반영)"
sed -i 's/hello v1/hello v2/' "$DEPLOY"
t0=$(date +%s)
git_rehearsal commit -q -am "hello v2"
push_refresh
wait_for "hello v2"
t1=$(date +%s)

log "v2 → v1 (git revert)"
git_rehearsal revert --no-edit HEAD >/dev/null
push_refresh
wait_for "hello v1"
t2=$(date +%s)

sleep 2
rm -f "$STOP"
wait "$LOAD_PID" 2>/dev/null || true
LOAD_PID=""

total=$(wc -l <"$OUT")
fail=$(grep -vc '^200 ' "$OUT" || true)
v1=$(grep -c '^200 hello v1$' "$OUT" || true)
v2=$(grep -c '^200 hello v2$' "$OUT" || true)

log "결과"
echo "요청 ${total}번 — 실패 ${fail}번 (v1 응답 ${v1} · v2 응답 ${v2})"
echo "v2 반영: $((t1 - t0))초 (커밋 push → 응답이 모두 v2 · 교체 완료)"
echo "되돌리기: $((t2 - t1))초 (git revert push → 응답이 모두 v1 · 교체 완료)"
if [ "$fail" -gt 0 ]; then
  echo "실패한 응답:"
  grep -v '^200 ' "$OUT" | sort | uniq -c
fi
[ "$fail" -eq 0 ]
