#!/usr/bin/env bash
#
# upgrade.sh 회귀 테스트. 가짜 템플릿(태그 v1.0.0 · v1.1.0)과 가짜 프로젝트를 임시 폴더에 만들어 돈다.
#
#   bash .claude/hooks/tests/test-upgrade.sh
#
# 고치기 전 README 절차가 실제로 망가지던 모양을 먼저 본다.
#   - 프로젝트가 지운 파일이 하나라도 있으면 아무것도 안 얹히는데 VERSION 만 올라갔다
#   - 커밋 안 한 변경 · 템플릿에 없는 태그에서도 VERSION 만 올라갔다
# 그래서 사례마다 VERSION 이 어떻게 됐는지를 꼭 같이 본다.

set -uo pipefail
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

HOOKS="$(cd "$(dirname "$0")/.." && pwd)"
UP="$HOOKS/upgrade.sh"
[ -f "$UP" ] || { echo "!! upgrade.sh 를 못 찾았다: $UP"; exit 1; }

TMP="$(mktemp -d)" || exit 1
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
N=0
P=""
OUT=""
RC=0
bad() { FAIL=$((FAIL + 1)); printf '  x %s\n' "$1"; printf '%s\n' "$OUT" | sed 's/^/      /'; }
ok()  { PASS=$((PASS + 1)); }

# --- 가짜 템플릿 ---------------------------------------------------------------
T="$TMP/tpl"
mkdir -p "$T/.claude/skills/plan" "$T/.claude/skills/evals" "$T/.claude/ci" || exit 1
git init -q -b main "$T" || exit 1
printf '1.0.0\n' > "$T/.claude/VERSION"
printf '# plan\n한 줄\n둘째 줄\n셋째 줄\n' > "$T/.claude/skills/plan/SKILL.md"
printf '# evals\n평가 한 줄\n' > "$T/.claude/skills/evals/SKILL.md"
printf '# STACK\n\n## 3. 명령\n\n```sh\nAREAS="<채워넣기>"\n# <영역>_TEST=""   # 테스트\n```\n\n| 항목 | 값 |\n|---|---|\n| 한 줄 정의 | `<채워넣기>` |\n| 지금 단계 | `<채워넣기>` |\n| 셋째 칸 | `<채워넣기>` |\n| 넷째 칸 | `<채워넣기>` |\n' > "$T/.claude/stack.md"
printf 'name: gate\njobs:\n  fast:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo 런타임\n      - run: bash .claude/hooks/pre-commit --ci-fast\n' > "$T/.claude/ci/github-actions.yml"
( cd "$T" && git add -A && git commit -q -m v1 && git tag -a v1.0.0 -m v1 ) || { echo "!! 템플릿 v1 실패"; exit 1; }
# v1.1.0 — 계획 스킬 · evals 를 고치고, 새 스킬 · 새 칸 · 새 선언을 더하고, CI 껍데기 끝에 줄을 더한다.
# 새 칸은 프로젝트가 채울 「지금 단계」 줄과 떨어뜨려 둔다. 붙어 있는 두 변경은 git 이 충돌로 보는 게 맞다
printf '1.1.0\n' > "$T/.claude/VERSION"
printf '# plan\n한 줄 (고침)\n둘째 줄\n셋째 줄\n' > "$T/.claude/skills/plan/SKILL.md"
printf '# evals\n평가 한 줄 (고침)\n' > "$T/.claude/skills/evals/SKILL.md"
mkdir -p "$T/.claude/skills/evals/more" "$T/.claude/skills/new" || exit 1
printf '새 파일\n' > "$T/.claude/skills/evals/more/notes.md"
printf '# new\n' > "$T/.claude/skills/new/SKILL.md"
printf '# STACK\n\n## 3. 명령\n\n```sh\nAREAS="<채워넣기>"\n# <영역>_TEST=""   # 테스트\n# <영역>_FORMAT_FILE=""   # 새 선언\nDEFAULT_BRANCH=""\n```\n\n| 항목 | 값 |\n|---|---|\n| 한 줄 정의 | `<채워넣기>` |\n| 지금 단계 | `<채워넣기>` |\n| 셋째 칸 | `<채워넣기>` |\n| 넷째 칸 | `<채워넣기>` |\n| 새 칸 하나 | `<채워넣기>` |\n' > "$T/.claude/stack.md"
printf 'name: gate\njobs:\n  fast:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo 런타임\n      - run: bash .claude/hooks/pre-commit --ci-fast\n      - run: echo 새 단계\n' > "$T/.claude/ci/github-actions.yml"
( cd "$T" && git add -A && git commit -q -m v1.1 && git tag -a v1.1.0 -m v1.1 ) || { echo "!! 템플릿 v1.1 실패"; exit 1; }

# subst <파일> <sed 식> — sed -i 는 macOS 와 문법이 달라서 임시 파일로 바꾼다
subst() { sed "$2" "$1" > "$1.tmp" && mv "$1.tmp" "$1" || { echo "!! 바꾸기 실패: $1"; exit 1; }; }

# proj — v1.0.0 으로 심은 새 프로젝트. stack.md 의 「지금 단계」 칸을 채우고 커밋해 둔다
proj() {
  N=$((N + 1))
  P="$TMP/p$N"
  git init -q -b main "$P" || exit 1
  ( cd "$P" && git -C "$T" archive v1.0.0 .claude | tar -x ) || { echo "!! archive 실패"; exit 1; }
  subst "$P/.claude/stack.md" 's/^| 지금 단계 | `<채워넣기>` |$/| 지금 단계 | MVP |/'
  ( cd "$P" && git add -A && git commit -q -m "harness v1" ) || { echo "!! 프로젝트 커밋 실패"; exit 1; }
}
up()  { OUT="$( cd "$P" && bash "$UP" "$T" "$@" 2>&1 )"; RC=$?; }
ver() { tr -d '\r\n ' < "$P/.claude/VERSION"; }

# expect <설명> <기대 rc> <기대 VERSION> <출력에 있어야 할 말|->
expect() {
  local label="$1" wrc="$2" wver="$3" yes="$4"
  if [ "$RC" -ne "$wrc" ]; then bad "$label — rc=$RC (기대 $wrc)"; return; fi
  if [ "$(ver)" != "$wver" ]; then bad "$label — VERSION=$(ver) (기대 $wver)"; return; fi
  if [ "$yes" != "-" ]; then case "$OUT" in *"$yes"*) ;; *) bad "$label — 출력에 '$yes' 가 없다"; return ;; esac; fi
  ok
}
has()  { if grep -qF -- "$2" "$P/$1" 2>/dev/null; then ok; else bad "$3 — $1 에 '$2' 가 없다"; fi; }
hasnt() { if [ ! -e "$P/$1" ]; then ok; else bad "$2 — $1 이 생겼다"; fi; }

echo "-- upgrade 회귀 ------------------------------"

# --- 깨끗이 얹는다 ---------------------------------------------------------------
proj
up
expect "깨끗한 프로젝트 · 얹고 올린다" 0 1.1.0 "1.0.0 → v1.1.0"
has .claude/skills/plan/SKILL.md "한 줄 (고침)" "템플릿이 고친 줄"
has .claude/skills/new/SKILL.md "# new" "새 스킬"
has .claude/stack.md "| 지금 단계 | MVP |" "프로젝트가 채운 값은 남는다"
has .claude/stack.md "| 새 칸 하나 |" "새 칸이 들어왔다"
case "$OUT" in *"새 칸 하나"*) ok ;; *) bad "새 칸 이름을 찍는다" ;; esac
case "$OUT" in *"§3 선언 <영역>_FORMAT_FILE"*) ok ;; *) bad "새 선언 이름을 찍는다 (<영역>_ 틀 줄)" ;; esac
case "$OUT" in *"§3 선언 DEFAULT_BRANCH"*) ok ;; *) bad "새 선언 이름을 찍는다 (전역 이름)" ;; esac
( cd "$P" && git commit -q -m "harness v1.1" ) || exit 1
up
expect "올린 뒤 다시 돌리면 할 것이 없다" 0 1.1.0 "이미 v1.1.0"

# --- 프로젝트가 지운 폴더는 빼고 얹는다 --------------------------------------------
# 고치기 전 절차는 이 경우 아무것도 안 얹고 VERSION 만 올렸다
proj
( cd "$P" && git rm -q -r .claude/skills/evals && git commit -q -m "evals 안 씀" ) || exit 1
up
expect "evals 를 지운 프로젝트 · 나머지는 얹는다" 0 1.1.0 "지운 것은 빼고"
has .claude/skills/plan/SKILL.md "한 줄 (고침)" "evals 를 지워도 다른 파일은 얹힌다"
hasnt .claude/skills/evals "지운 폴더에 새 버전이 파일을 더해도 되살리지 않는다"

# --- 시작하면 안 되는 경우는 아무것도 안 바꾼다 ------------------------------------
proj
printf '고침\n' >> "$P/.claude/skills/plan/SKILL.md"
up
expect "커밋 안 한 변경 · 멈춘다" 1 1.0.0 "커밋 안 한 변경이 있다"
proj
printf '0.9.9\n' > "$P/.claude/VERSION"
( cd "$P" && git commit -q -am "모르는 버전" ) || exit 1
up
expect "템플릿에 없는 태그 · 멈춘다" 1 0.9.9 "v0.9.9 태그가 없다"
proj
up 9.9.9
expect "없는 새 버전 · 멈춘다" 1 1.0.0 "v9.9.9 태그가 없다"
OUT="$( cd "$TMP" && bash "$UP" "$T" 2>&1 )"; RC=$?
if [ "$RC" -eq 1 ]; then ok; else bad "저장소 밖 · 멈춘다 — rc=$RC"; fi

# --- 같은 줄을 둘 다 고쳤으면 충돌로 남긴다 ----------------------------------------
proj
subst "$P/.claude/skills/plan/SKILL.md" 's/^한 줄$/한 줄 (프로젝트가 고침)/'
( cd "$P" && git commit -q -am "계획 스킬 손봄" ) || exit 1
up
expect "같은 줄 · 충돌로 남기고 rc=2" 2 1.1.0 ".claude/skills/plan/SKILL.md"
has .claude/skills/plan/SKILL.md "<<<<<<<" "충돌 표시가 남는다"
has .claude/skills/new/SKILL.md "# new" "충돌이 있어도 다른 파일은 얹힌다"

# --- CI 파일도 합친다 ------------------------------------------------------------
proj
mkdir -p "$P/.github/workflows" || exit 1
git -C "$T" show v1.0.0:.claude/ci/github-actions.yml | sed 's/echo 런타임/uses: actions\/setup-python@x/' > "$P/.github/workflows/gate.yml"
( cd "$P" && git add -A && git commit -q -m "CI 놓음" ) || exit 1
up
expect "CI 파일 · 프로젝트 값은 두고 새 단계는 들인다" 0 1.1.0 "CI 파일 합침"
has .github/workflows/gate.yml "setup-python@x" "프로젝트가 채운 런타임"
has .github/workflows/gate.yml "echo 새 단계" "템플릿이 더한 단계"

echo "-- 통과 $PASS · 실패 $FAIL ----------------------"
[ "$FAIL" -eq 0 ] || exit 1
