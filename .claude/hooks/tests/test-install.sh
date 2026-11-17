#!/usr/bin/env bash
#
# install.sh 회귀 테스트. 임시 git 저장소에서만 돌고 이 저장소 설정은 건드리지 않는다.
#
#   bash .claude/hooks/tests/test-install.sh
#
# 설치는 게이트의 입구다. 여기서 말없이 실패하면 그 사람에게는 게이트가 없다.
# 그래서 「설정했다」가 아니라 core.hooksPath 가 실제로 바뀌었는지(또는 안 바뀌었는지)까지 본다.
# install.ps1 은 Windows PowerShell 이 있어야 돌아서 여기서 보지 않는다. 같은 일을 하도록 고칠 때 맞춘다.

set -uo pipefail
# 개발 PC 의 전역 git 설정(훅 경로 등)이 결과를 흔들지 않게 끊는다
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

HOOKS="$(cd "$(dirname "$0")/.." && pwd)"
for f in install.sh pre-commit commit-msg; do
  [ -f "$HOOKS/$f" ] || { echo "!! $f 를 못 찾았다: $HOOKS/$f"; exit 1; }
done

TMP="$(mktemp -d)" || exit 1
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
N=0
R=""
OUT=""
RC=0

bad() { FAIL=$((FAIL + 1)); printf '  x %s\n' "$1"; printf '%s\n' "$OUT" | sed 's/^/      /'; }

# repo — 사례마다 새 저장소에 훅 폴더를 놓는다. 준비가 실패하면 그 자리에서 멈춘다
repo() {
  N=$((N + 1))
  R="$TMP/r$N"
  git init -q "$R" || { echo "!! git init 실패"; exit 1; }
  mkdir -p "$R/.claude/hooks" || exit 1
  cp "$HOOKS/install.sh" "$HOOKS/pre-commit" "$HOOKS/commit-msg" "$R/.claude/hooks/" || exit 1
}

# inst [인자…] — 저장소 안에서 install.sh 를 돌려 OUT · RC 에 담는다
inst() { OUT="$( cd "$R" && bash .claude/hooks/install.sh "$@" 2>&1 )"; RC=$?; }

# hooks_path — 지금 core.hooksPath (없으면 빈 값)
hooks_path() { git -C "$R" config core.hooksPath || true; }

# expect <설명> <기대 rc> <있어야 할 말|-> <없어야 할 말|-> <기대 core.hooksPath|->
expect() {
  local label="$1" wrc="$2" yes="$3" no="$4" wpath="$5" got
  if [ "$RC" -ne "$wrc" ]; then bad "$label — rc=$RC (기대 $wrc)"; return; fi
  if [ "$yes" != "-" ]; then
    case "$OUT" in *"$yes"*) ;; *) bad "$label — 출력에 '$yes' 가 없다"; return ;; esac
  fi
  if [ "$no" != "-" ]; then
    case "$OUT" in *"$no"*) bad "$label — 출력에 '$no' 가 있으면 안 된다"; return ;; esac
  fi
  if [ "$wpath" != "-" ]; then
    got="$(hooks_path)"
    [ "$got" = "$wpath" ] || { bad "$label — core.hooksPath='$got' (기대 '$wpath')"; return; }
  fi
  PASS=$((PASS + 1))
}

echo "-- install 회귀 ------------------------------"

# --- 새 저장소 ---------------------------------------------------------------
repo
inst
expect "새 저장소 · 배선한다"           0 "설치 완료" - ".claude/hooks"
inst
expect "두 번 돌려도 같다"              0 "설치 완료" "이미 훅이 있다" ".claude/hooks"

# --- 다른 훅 경로가 있으면 --force 없이 멈춘다 -----------------------------
# 말없이 덮으면 그쪽(husky 등) 훅이 조용히 꺼진다
repo
git -C "$R" config core.hooksPath .husky || exit 1
inst
expect "다른 훅 경로 · 멈춘다"          1 "이미 .husky" "설치 완료" ".husky"
inst --force
expect "다른 훅 경로 · --force 면 덮는다" 0 "--force 라서 덮는다" - ".claude/hooks"

# --- 잘못 부르면 아무것도 안 바꾸고 멈춘다 ---------------------------------
repo
inst --froce
expect "모르는 인자"                    1 "모르는 인자" "설치 완료" ""
OUT="$( cd "$TMP" && GIT_DIR="$TMP/nowhere" bash "$HOOKS/install.sh" 2>&1 )"; RC=$?
expect "git 저장소 밖"                  1 "git 저장소가 아니다" - -
repo
rm -f "$R/.claude/hooks/pre-commit"
inst
expect "pre-commit 이 없으면 실패"      1 "pre-commit 가 없다" "설치 완료" -

# --- 기존 훅이 있으면 알린다 (워크트리 포함) -------------------------------
repo
printf '#!/bin/sh\nexit 0\n' > "$R/.git/hooks/pre-push" || exit 1
inst
expect "기존 훅 · 알린다"               0 "pre-push" - ".claude/hooks"
# 워크트리에서는 .git 이 파일이다. 고치기 전 install 은 .git/hooks 를 바로 읽어 기존 훅을 못 봤다
repo
printf '#!/bin/sh\nexit 0\n' > "$R/.git/hooks/pre-push" || exit 1
git -C "$R" -c user.name=t -c user.email=t@t commit -q --allow-empty --no-verify -m base || exit 1
git -C "$R" worktree add -q "$TMP/wt$N" 2>/dev/null || { echo "!! worktree add 실패"; exit 1; }
mkdir -p "$TMP/wt$N/.claude/hooks" || exit 1
cp "$HOOKS/install.sh" "$HOOKS/pre-commit" "$HOOKS/commit-msg" "$TMP/wt$N/.claude/hooks/" || exit 1
OUT="$( cd "$TMP/wt$N" && bash .claude/hooks/install.sh 2>&1 )"; RC=$?
expect "워크트리 · 공용 폴더의 기존 훅을 알린다" 0 "pre-push" - ".claude/hooks"

# --- CRLF 로 받은 훅을 고치고 실행 비트를 지킨다 ---------------------------
# CRLF 가 섞이면 bash 가 $'\r': command not found 로 죽는다. 원인을 찾기 어렵다
repo
awk '{ printf "%s\r\n", $0 }' "$R/.claude/hooks/commit-msg" > "$R/.claude/hooks/cm.crlf" \
  && mv "$R/.claude/hooks/cm.crlf" "$R/.claude/hooks/commit-msg" || { echo "!! CRLF 준비 실패"; exit 1; }
chmod +x "$R/.claude/hooks/commit-msg" 2>/dev/null
inst
expect "CRLF 훅 · 고쳤다고 알린다"      0 "줄바꿈 교정: .claude/hooks/commit-msg" - ".claude/hooks"
if tr -d '\r' < "$R/.claude/hooks/commit-msg" | cmp -s - "$R/.claude/hooks/commit-msg"; then
  PASS=$((PASS + 1))
else
  bad "CRLF 훅 · 고친 뒤에도 CR 이 남았다"
fi
# Windows 는 실행 비트가 없어서 늘 실행 가능으로 보인다. 그래도 같은 검사를 돌린다
if [ -x "$R/.claude/hooks/commit-msg" ]; then
  PASS=$((PASS + 1))
else
  bad "CRLF 훅 · 고친 뒤 실행 비트가 사라졌다"
fi

# --- git 에 실행 비트가 안 실렸으면 알린다 ---------------------------------
# 맥 · 리눅스 팀원은 받은 뒤 훅이 꺼진다
repo
git -C "$R" add .claude/hooks/pre-commit .claude/hooks/commit-msg || exit 1
git -C "$R" update-index --chmod=-x .claude/hooks/pre-commit .claude/hooks/commit-msg || exit 1
inst
expect "실행 비트 없이 추적 · 알린다"   0 "실행 비트가 기록돼 있지 않다" - ".claude/hooks"
git -C "$R" update-index --chmod=+x .claude/hooks/pre-commit .claude/hooks/commit-msg || exit 1
inst
expect "실행 비트와 함께 추적 · 조용하다" 0 "설치 완료" "실행 비트가 기록돼 있지 않다" ".claude/hooks"

echo "-- 통과 $PASS · 실패 $FAIL ----------------------"
[ "$FAIL" -eq 0 ] || exit 1
