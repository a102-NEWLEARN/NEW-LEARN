#!/usr/bin/env bash
#
# session-start.sh 회귀 테스트. 임시 git 저장소에서만 돌고 이 저장소 파일은 건드리지 않는다.
#
#   bash .claude/hooks/tests/test-session-start.sh
#
# 대화마다 도는 훅이라 두 가지를 본다 — 늘 0 으로 끝나는가, 알릴 것이 있을 때만 알리는가.
# 빈칸 하나에도 같은 경고를 매번 띄우면 경고를 안 읽게 된다.

set -uo pipefail
# 개발 PC 의 전역 · 시스템 git 설정이 결과를 흔들지 않게 끊는다
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

HOOKS="$(cd "$(dirname "$0")/.." && pwd)"
SS="$HOOKS/session-start.sh"
[ -f "$SS" ] || { echo "!! session-start.sh 를 못 찾았다: $SS"; exit 1; }

TMP="$(mktemp -d)" || exit 1
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
OUT=""
RC=0

bad() { FAIL=$((FAIL + 1)); printf '  x %s\n' "$1"; printf '%s\n' "$OUT" | sed 's/^/      /'; }

# run <폴더> — Claude Code 처럼 CLAUDE_PROJECT_DIR 로 그 폴더를 주고 돌린다
run() { OUT="$( CLAUDE_PROJECT_DIR="$1" bash "$SS" 2>&1 )"; RC=$?; }

# expect <설명> <있어야 할 말|-> <없어야 할 말|-> — rc 는 늘 0 이어야 한다
# 🔴 출력 검사에 파이프를 쓰지 않는다 (grep -q 가 먼저 끝나면 SIGPIPE 가 결과가 된다)
expect() {
  local label="$1" yes="$2" no="$3"
  if [ "$RC" -ne 0 ]; then bad "$label — rc=$RC (늘 0 이어야 한다)"; return; fi
  if [ "$yes" != "-" ]; then
    case "$OUT" in *"$yes"*) ;; *) bad "$label — 출력에 '$yes' 가 없다"; return ;; esac
  fi
  if [ "$no" != "-" ]; then
    case "$OUT" in *"$no"*) bad "$label — 출력에 '$no' 가 있으면 안 된다"; return ;; esac
  fi
  PASS=$((PASS + 1))
}

# stack <줄…> — 저장소의 .claude/stack.md 를 그 줄들로 쓴다
stack() { printf '%s\n' "$@" > "$R/.claude/stack.md" || { echo "!! stack.md 쓰기 실패"; exit 1; }; }

echo "-- session-start 회귀 -------------------------"

# --- 늘 0 으로 끝난다 ---------------------------------------------------------
run "$TMP/nowhere"
expect "없는 폴더 · 조용히 끝난다" - "⚠️"
mkdir -p "$TMP/plain" || exit 1
run "$TMP/plain"
expect "git 저장소가 아님 · 훅 경고를 안 띄운다" - "git 훅이"

# --- git 훅 배선 ---------------------------------------------------------------
R="$TMP/r"
git init -q "$R" || { echo "!! git init 실패"; exit 1; }
git -C "$R" symbolic-ref HEAD refs/heads/work || exit 1
mkdir -p "$R/.claude" || exit 1
run "$R"
expect "브랜치를 찍는다"                 "브랜치: work" -
expect "훅이 안 걸렸으면 알린다"         "git 훅이 .claude/hooks 를 안 본다" -
git -C "$R" config core.hooksPath .claude/hooks || exit 1
run "$R"
expect "훅이 걸렸으면 안 알린다"         "브랜치: work" "git 훅이"

# --- stack.md 빈칸 -------------------------------------------------------------
stack '# STACK' '## 3. 명령' '```sh' 'AREAS="<채워넣기>"' '```' '## 4. 게이트' '| 러너 | `<채워넣기>` |'
run "$R"
expect "아직 안 심었으면 /harness-init" "/harness-init" "§3(명령)"
stack '# STACK' '## 3. 명령' '```sh' 'AREAS="app"' 'app_PATH="."' '```' \
  '## 4. 게이트' '| 러너 | `<채워넣기>` |' '## 6. 배포' '| 어디로 | `<채워넣기>` |' '| 비용 | `<채워넣기>` |'
run "$R"
expect "§3 을 채웠으면 남은 절만 센다"   "남은 빈칸: §4 1 · §6 2" "§3(명령)"
stack '# STACK' '## 3. 명령' '```sh' 'AREAS="app"' 'app_LINT="<채워넣기>"' '```' '## 6. 배포' '| 어디로 | `<채워넣기>` |'
run "$R"
expect "§3 명령 칸이 비었으면 따로 알린다" "§3(명령)에 빈칸 1개" -
expect "§3 도 센다"                       "남은 빈칸: §3 1 · §6 1" -
stack '# STACK' '## 3. 명령' '```sh' 'AREAS="app"' 'app_PATH="."' '```' '## 6. 배포' '| 어디로 | 해당 없음 — CLI 라서 |'
run "$R"
expect "빈칸이 없으면 안 알린다"         "브랜치: work" "빈칸"
# Windows 에서 받은 줄바꿈(CRLF)도 같게 센다
printf '# STACK\r\n## 4. 게이트\r\n| 러너 | `<채워넣기>` |\r\n' > "$R/.claude/stack.md" || exit 1
run "$R"
expect "CRLF stack.md 도 센다"           "남은 빈칸: §4 1" -

# --- 템플릿의 stack.md 그대로 -------------------------------------------------
# 원본은 빈칸 상태라 심으라는 말이 떠야 한다. 절 머리 모양이 바뀌어 하나도 못 세면 여기서 깨진다
# /harness-init 으로 심은 저장소의 stack.md 는 프로젝트 값으로 채워져 있어 이 검사가 뜻이 없다 — 빈칸 상태일 때만 본다
if grep -q '^AREAS="<채워넣기>"' "$HOOKS/../stack.md"; then
  cp "$HOOKS/../stack.md" "$R/.claude/stack.md" || { echo "!! stack.md 복사 실패"; exit 1; }
  run "$R"
  expect "템플릿 stack.md · /harness-init" "/harness-init" -
else
  echo "  - 템플릿 stack.md: 심은 저장소라 건너뜀 (템플릿 저장소에서는 돈다)"
fi

echo "-- 통과 $PASS · 실패 $FAIL ----------------------"
[ "$FAIL" -eq 0 ] || exit 1
