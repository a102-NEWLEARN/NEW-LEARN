#!/usr/bin/env bash
#
# pre-commit 회귀 테스트. 임시 git 저장소에서만 돌고 이 저장소 파일은 건드리지 않는다.
#
#   bash .claude/hooks/tests/test-pre-commit.sh
#
# 이 훅이 가장 쉽게 망가지는 모양은 「아무것도 검사하지 않고 초록」이다. 그래서 막아야 할 때
# 정말 막는지(rc)와 그 까닭이 찍히는지(출력)를 같이 본다.
#
# 시크릿 스캐너는 마지막 몇 사례에만 넣는다. 탐지 규칙은 test-secret-scan.sh 가 본다.
# 여기서는 게이트가 스캐너를 부르는지와 막힌 뒤의 안내만 본다.

set -uo pipefail
# 개발 PC 의 전역 git 설정이 결과를 흔들지 않게 끊는다. 전역으로 core.quotePath=false 를
# 켜 둔 PC 에서는 한글 경로 사례가 고치기 전 훅으로도 초록이 된다.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
# CI 러너에서 돌려도 로컬과 같은 길을 타게 한다 (GITLAB_CI · GITHUB_ACTIONS=true 면 스캔을 건너뛰는 분기가 있다)
unset GITLAB_CI GITHUB_ACTIONS

HOOKS="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$HOOKS/pre-commit"
[ -f "$HOOK" ] || { echo "!! pre-commit 을 못 찾았다: $HOOK"; exit 1; }

# 문서 크기 상한은 훅과 HARNESS.md 5절 크기 예산 표 두 곳에 있다. 표에서 읽은 숫자로
# 아래 경계 사례를 돌려서 둘이 어긋나면 깨지게 한다.
# budget <표 첫 칸> — 5절 안에서 첫 칸이 그 글자인 행의 둘째 칸 숫자
HARNESS="$(cd "$HOOKS/.." && pwd)/HARNESS.md"
budget() {
  awk -F'|' -v k="$1" '
    /^## / { s = ($0 ~ /^## 5\./) }
    s { c = $2; gsub(/^[ \t]+|[ \t]+$/, "", c)
        if (c == k) { n = $3; gsub(/[^0-9]/, "", n); print n; exit } }
  ' "$HARNESS"
}
LIM_CLAUDE="$(budget '`CLAUDE.md` · `AGENTS.md`')"
LIM_DOC="$(budget '그 외 문서')"
case "$LIM_CLAUDE:$LIM_DOC" in
  [0-9]*:[0-9]*) ;;
  *) echo "!! HARNESS.md 5절 크기 예산 표에서 상한을 못 읽었다 (CLAUDE.md · AGENTS.md='$LIM_CLAUDE' · 그 외 문서='$LIM_DOC'): $HARNESS"
     exit 1 ;;
esac

TMP="$(mktemp -d)" || exit 1
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
N=0
R=""
OUT=""
RC=0

bad() { FAIL=$((FAIL + 1)); printf '  x %s\n' "$1"; printf '%s\n' "$OUT" | sed 's/^/      /'; }

# 🔴 준비가 실패하면 그 자리에서 exit 한다. 넘어가면 빈 저장소를 검사해 거짓 통과한다.

# repo — 사례마다 새 저장소. 앞 사례의 스테이지가 섞이지 않게 한다.
repo() {
  N=$((N + 1))
  R="$TMP/r$N"
  git init -q "$R" || { echo "!! git init 실패"; exit 1; }
  # 고치기 전 훅이 한글 경로를 놓치던 조건을 못 박는다
  git -C "$R" config core.quotePath true || exit 1
  mkdir -p "$R/.claude/hooks" || exit 1
  # CI 모드는 스캐너가 없으면 멈춘다. 늘 통과하는 가짜를 둔다.
  # 진짜 스캐너는 아래 with_scan 사례에서만 넣는다. 탐지 규칙은 test-secret-scan.sh 가 본다
  printf '#!/usr/bin/env bash\nexit 0\n' > "$R/.claude/hooks/secret-scan.sh" || exit 1
}

# decl <stack.md sh 블록에 넣을 줄…>
decl() {
  {
    echo '# STACK'
    echo '```sh'
    printf '%s\n' "$@"
    echo '```'
  } > "$R/.claude/stack.md" || { echo "!! stack.md 쓰기 실패"; exit 1; }
}

# put <파일> <내용> — 만들고 스테이지한다
put() {
  mkdir -p "$R/$(dirname "$1")" || exit 1
  printf '%s\n' "$2" > "$R/$1" || { echo "!! 쓰기 실패: $1"; exit 1; }
  git -C "$R" add -- "$1" || { echo "!! git add 실패: $1"; exit 1; }
}

# doc <파일> <줄 수> — 그 줄 수만큼 채운 문서를 만들고 스테이지한다
doc() {
  mkdir -p "$R/$(dirname "$1")" || exit 1
  awk -v n="$2" 'BEGIN { for (i = 0; i < n; i++) print "줄" }' > "$R/$1" \
    || { echo "!! 쓰기 실패: $1"; exit 1; }
  git -C "$R" add -- "$1" || { echo "!! git add 실패: $1"; exit 1; }
}

# hook [인자…] — 저장소 안에서 훅을 돌려 OUT · RC 에 담는다
hook() { OUT="$( cd "$R" && bash "$HOOK" "$@" 2>&1 )"; RC=$?; }

# expect <설명> <기대 rc> <출력에 있어야 할 말|-> <출력에 없어야 할 말|->
# 🔴 출력 검사에 파이프를 쓰지 않는다. grep -q 가 먼저 끝나면 printf 가 SIGPIPE 로 죽고
# pipefail 이 그 141 을 결과로 삼는다. case 에는 그 함정이 없다.
expect() {
  local label="$1" wrc="$2" yes="$3" no="$4"
  if [ "$RC" -ne "$wrc" ]; then bad "$label — rc=$RC (기대 $wrc)"; return; fi
  if [ "$yes" != "-" ]; then
    case "$OUT" in
      *"$yes"*) ;;
      *) bad "$label — 출력에 '$yes' 가 없다"; return ;;
    esac
  fi
  if [ "$no" != "-" ]; then
    case "$OUT" in
      *"$no"*) bad "$label — 출력에 '$no' 가 있으면 안 된다"; return ;;
    esac
  fi
  PASS=$((PASS + 1))
}

# check <설명> <기대 rc> <있어야 할 말|-> <없어야 할 말|-> [훅 인자…]
check() {
  local label="$1" wrc="$2" yes="$3" no="$4"; shift 4
  hook "$@"
  expect "$label" "$wrc" "$yes" "$no"
}

# 영역 테스트 명령. 그 폴더의 .js 에 FAIL 이 있으면 실패한다.
T_FAIL='! grep -q FAIL *.js'

echo "-- pre-commit 회귀 ---------------------------"

# --- git 을 못 쓰면 CI 는 멈춘다 --------------------------------------------
# 편집 훅용 탈출구(조용히 exit 0)를 CI 가 같이 타면 검사 0개짜리 초록이 된다.
repo
decl 'AREAS="app"' 'app_PATH="."' "app_TEST=\"$T_FAIL\""
put a.js 'FAIL'
NOGIT="$TMP/nogit"
mkdir -p "$NOGIT" || exit 1
printf '#!/bin/sh\necho "git: not found" >&2\nexit 127\n' > "$NOGIT/git" || exit 1
chmod +x "$NOGIT/git" || exit 1
for m in --ci --ci-fast --changed-areas; do
  OUT="$( cd "$R" && PATH="$NOGIT:$PATH" bash "$HOOK" "$m" 2>&1 )"; RC=$?
  expect "git 없음 · $m 는 멈춘다" 1 "git 저장소를 못 읽는다" -
done
OUT="$( cd "$R" && PATH="$NOGIT:$PATH" bash "$HOOK" 2>&1 )"; RC=$?
expect "git 없음 · 커밋 게이트는 빠진다" 0 - -
OUT="$( cd "$R" && PATH="$NOGIT:$PATH" bash "$HOOK" --format-only 2>&1 )"; RC=$?
expect "git 없음 · --format-only 는 빠진다" 0 - -
OUT="$( cd "$R" && GIT_DIR="$TMP/nowhere" bash "$HOOK" --ci 2>&1 )"; RC=$?
expect "저장소를 못 읽음 · --ci 는 멈춘다" 1 "git 저장소를 못 읽는다" -

# --- 추적 파일이 0개 --------------------------------------------------------
# CI 체크아웃이 비었으면 검사할 것이 없어 말없이 초록이 됐다
repo
decl 'AREAS="app"' 'app_PATH="."' 'app_TEST="true"'
check "추적 파일 0개 · --ci 는 멈춘다"       1 "추적 중인 파일이 없다" - --ci
check "추적 파일 0개 · 커밋 게이트는 배너만" 0 "바뀐 파일 없음" -

# --- stack.md 가 비었을 때 ---------------------------------------------------
repo
decl 'AREAS="<채워넣기>"'
put a.js 'x'
check "빈 stack.md · 커밋은 통과"    0 "안 채워져" -
check "빈 stack.md · --ci 는 멈춘다" 1 "안 채워져" "**" --ci
# 공백만 적은 AREAS. 고치기 전 훅은 「채웠다」로 보고 영역 0개를 돌아 CI 를 초록으로 끝냈다
repo
decl 'AREAS=" "' 'app_PATH="."' 'app_TEST="false"'
put a.js 'x'
check "AREAS 공백만 · --ci 는 멈춘다"          1 "안 채워져" - --ci
check "AREAS 공백만 · 커밋은 알리고 통과"      0 "안 채워져" -
check "AREAS 공백만 · --changed-areas 는 멈춘다" 1 "안 채워져" - --changed-areas HEAD

# --- sh 블록이 둘이면 막는다 ---------------------------------------------------
# 훅 셋은 첫 블록만 읽는다. §3 앞에 예시 블록이 생기면 §3 의 규칙이 말없이 꺼진다.
repo
{ echo '# STACK'; echo '```sh'; echo 'echo 예시'; echo '```'
  echo '## 3. 명령'; echo '```sh'; echo 'AREAS="app"'; echo 'app_PATH="."'; echo 'app_TEST="false"'; echo '```'
} > "$R/.claude/stack.md" || exit 1
put a.js 'x'
check "sh 블록 둘 · 커밋도 막는다" 1 "sh 블록이 2개다" -
check "sh 블록 둘 · --ci 도 멈춘다" 1 "sh 블록이 2개다" - --ci

# --- Windows 줄바꿈(CRLF)으로 받은 stack.md 도 읽는다 ------------------------
repo
decl 'AREAS="app"' 'app_PATH="."' 'app_TEST="false"'
awk '{ printf "%s\r\n", $0 }' "$R/.claude/stack.md" > "$R/.claude/stack.crlf" \
  && mv "$R/.claude/stack.crlf" "$R/.claude/stack.md" || { echo "!! CRLF 변환 실패"; exit 1; }
put a.js 'x'
check "CRLF stack.md · 선언이 읽힌다" 1 "테스트 실패" -

# --- 영역 틀을 주석째 복사하면 검사가 0개다 ----------------------------------
repo
decl 'AREAS="app"' \
  '# app_PATH="."          # 이 영역의 폴더' \
  '# app_TEST="false"      # 테스트'
put a.js 'x'
check "틀을 주석째 · --ci 는 멈춘다"      1 "검사 명령이 하나도 없다" - --ci
# 까닭은 남은 # 이다. 고치기 전 훅은 「AREAS 에서 뺀다」고 엉뚱한 곳을 가리켰다.
expect "틀을 주석째 · --ci 는 남은 # 을 가리킨다" 1 "앞의 # 을 지운다" "AREAS 에서 뺀다"
check "틀을 주석째 · --ci-fast 는 멈춘다" 1 "검사 명령이 하나도 없다" - --ci-fast
check "틀을 주석째 · 커밋은 알리기만"     0 "돌릴 검사가 없다" -
expect "틀을 주석째 · 커밋도 남은 # 을 가리킨다" 0 "앞의 # 을 지운다" -

# --- 틀 줄의 # 만 지우고 <영역> 을 안 바꾸면 막는다 ---------------------------
# 대입문이 아니라서 걸러지고 검사가 0개가 된다. 고치기 전 훅은 커밋을 통과시켰다.
# CI 는 멈췄지만 까닭 대신 「AREAS 에서 뺀다」고 안내했다.
repo
decl 'AREAS="app"' \
  '<영역>_PATH="."   # 이 영역의 폴더' \
  '<영역>_TEST="false"   # 테스트'
put a.js 'x'
check "<영역> 그대로 · 커밋도 막는다"         1 "으로 시작하지 않는 줄" -
check "<영역> 그대로 · --ci 는 까닭을 댄다"   1 "<영역>_TEST" "AREAS 에서 뺀다" --ci
check "<영역> 그대로 · --format-only 는 통과" 0 - - --format-only

# --- 「이름=」 으로 시작하지 않는 줄도 막는다 ----------------------------------
# 줄 앞 공백 · export · = 양옆 공백도 대입문으로 안 보여 걸러진다. 고치기 전 훅은 실패해야 할
# 린트를 돌리지도 않고 커밋 · CI 를 둘 다 통과시켰다.
for l in '  app_LINT="false"' 'export app_LINT="false"' 'app_LINT = "false"'; do
  repo
  decl 'AREAS="app"' 'app_PATH="."' "$l" 'app_TEST="true"'
  put a.js 'x'
  check "'$l' · 커밋도 막는다"         1 "으로 시작하지 않는 줄" -
  check "'$l' · --ci 는 멈춘다"        1 "$l" - --ci
  check "'$l' · --format-only 는 통과" 0 - - --format-only
done
# 빈 줄 · 들여 쓴 주석은 그대로 둔다
repo
decl 'AREAS="app"' '' '   # 들여 쓴 주석' 'app_PATH="."' 'app_TEST="true"'
put a.js 'x'
check "빈 줄 · 들여 쓴 주석 · 통과" 0 "통과" "으로 시작하지 않는 줄"

# --- 명령 칸에 빈칸 표시가 남았을 때 -------------------------------------------
# 고치기 전 훅은 그 명령을 그대로 돌려 셸 문법 오류로 커밋까지 막았다.
# CI 는 멈추고 커밋 게이트는 알리고 넘어간다.
repo
decl 'AREAS="app"' 'app_PATH="."' 'app_LINT="<채워넣기>"' 'app_TEST="true"'
put a.js 'x'
check "빈칸 명령 · 커밋은 알리고 통과"  0 "린트 건너뜀" "syntax error"
check "빈칸 명령 · --ci 는 멈춘다"      1 "빈칸 표시가 남아 있다" "syntax error" --ci
# 돌린 명령이 없다. 고치기 전 훅은 끝에 「찍힌 명령을 그대로 돌려 재현」하라고 했다.
expect "빈칸 명령 · --ci 끝 안내가 없는 명령을 가리키지 않는다" 1 "돌다 실패한 명령은 없다" "그대로 돌려 재현"
check "빈칸 명령 · --ci-fast 도 멈춘다" 1 "빈칸 표시가 남아 있다" "syntax error" --ci-fast
expect "빈칸 명령 · --ci-fast 끝 안내가 없는 명령을 가리키지 않는다" 1 "돌다 실패한 명령은 없다" "그대로 돌려 재현"

# --- 값에 안 정한 변수(${X})가 있어도 끝까지 읽는다 -----------------------------
# set -u 로 읽으면 셸이 그 자리에서 끝나 rc=1 이다. --format-only 는 파일을 고칠 때마다
# 불려서 그때마다 hook error 가 뜬다.
unset UNSET_X
repo
decl 'AREAS="app"' 'app_PATH="."' 'app_TEST="true ${UNSET_X}"'
put a.js 'x'
check "안 정한 변수 · --format-only 는 통과" 0 - "unbound" --format-only
check "안 정한 변수 · 커밋도 통과"          0 "통과" "unbound"
# 실행할 때 펼치는 변수(작은따옴표 값). 고치기 전 훅은 set -u 를 명령에 물려줘서 손으로는 되는 명령이
# 훅에서만 unbound variable 로 죽었다. 가상환경 activate 같은 스크립트가 이렇게 죽는다.
unset UNSET_Y
repo
decl 'AREAS="app"' 'app_PATH="."' "app_TEST='test -z \"\$UNSET_Y\"'"
put a.js 'x'
check "실행 때 펼치는 안 정한 변수 · 커밋 통과" 0 "통과" "unbound"
check "실행 때 펼치는 안 정한 변수 · --ci 통과" 0 "통과" "unbound" --ci

# --- 훅이 쓰는 이름을 덮으면 막는다 --------------------------------------------
# 블록은 훅의 변수 공간에 읽힌다. MODE 를 덮으면 모드가 바뀌어 엉뚱한 검사를 돈다.
repo
decl 'AREAS="app"' 'app_PATH="."' 'app_TEST="true"' 'MODE="ci"'
put a.js 'x'
check "훅이 쓰는 이름 · 커밋도 막는다"          1 "훅이 쓰는 이름과 겹친다" -
check "훅이 쓰는 이름 · --format-only 는 통과" 0 - - --format-only

# --- 큰따옴표 값 속 $( ) 는 읽을 때 돌아서 막는다 ------------------------------
for v in '"test $(echo 1) = 1"' '"test `echo 1` = 1"'; do
  repo
  decl 'AREAS="app"' 'app_PATH="."' "app_TEST=$v"
  put a.js 'x'
  check "큰따옴표 값의 명령 치환 $v · 커밋도 막는다" 1 "작은따옴표로 감싼다" -
done
# 실행할 때 돌리는 두 모양은 그대로 둔다
for v in "'test \$(echo 1) = 1'" '"test \$(echo 1) = 1"'; do
  repo
  decl 'AREAS="app"' 'app_PATH="."' "app_TEST=$v"
  put a.js 'x'
  check "실행할 때 펼침 $v · 통과" 0 "통과" "작은따옴표로 감싼다"
done

# --- 값에 ${X:?} · ${X?} 가 있으면 못 읽는다고 막는다 ---------------------------
# set +u 여도 셸이 그 자리에서 끝난다. 고치기 전 훅은 안내 없이 rc=1 로 죽고 임시 파일을 남겼다.
# --format-only 도 그래서 파일을 고칠 때마다 hook error 가 떴다.
for v in '${UNSET_X:?}' '${UNSET_X?}'; do
  repo
  decl 'AREAS="app"' 'app_PATH="."' "app_TEST=\"true $v\""
  put a.js 'x'
  check "$v · --format-only 는 통과" 0 - - --format-only
  check "$v · --ci 는 멈춘다"        1 "셸이 못 읽었다" - --ci
  mkdir -p "$TMP/t$N" || exit 1
  OUT="$( cd "$R" && TMPDIR="$TMP/t$N" bash "$HOOK" 2>&1 )"; RC=$?
  expect "$v · 커밋은 막고 까닭을 댄다" 1 "셸이 못 읽었다" -
  # 임시 파일 줄 번호는 stack.md 와 안 맞아서 떼고 찍는다
  expect "$v · 셸 오류에서 변수 이름만 남긴다" 1 "UNSET_X" ": line "
  left="$(ls -A "$TMP/t$N")"
  if [ -z "$left" ]; then PASS=$((PASS + 1)); else bad "$v · 임시 파일이 남았다: $left"; fi
done

# --- 값 뒤에 # 없이 설명이 붙으면 못 읽는다고 멈춘다 ------------------------
# 괄호가 있으면 셸이 문법 오류로 중간에 멈춘다. 없으면 설명을 명령으로 돌리고 대입을 버린다.
# 어느 쪽이든 고치기 전 훅은 그 단계를 빼고 초록을 냈다.
repo
decl 'AREAS="app"' 'app_PATH="."          이 영역의 폴더 (저장소 루트 기준)' 'app_TEST="false"'
put a.js 'x'
check "설명에 괄호 · --ci 는 멈춘다"  1 "모양이 아닌 줄" - --ci
check "설명에 괄호 · 커밋도 막는다"   1 "모양이 아닌 줄" -
repo
decl 'AREAS="app"' 'app_PATH="."' 'app_LINT="false"      린트'
put a.js 'x'
check "설명 한 낱말 · --ci 는 멈춘다" 1 "app_LINT" - --ci
check "설명 한 낱말 · 커밋도 막는다"  1 "모양이 아닌 줄" -
check "잘못 적어도 --format-only 는 통과" 0 - - --format-only

# 주석 안의 따옴표 · 괄호, 값 안의 이스케이프한 따옴표는 그대로 읽힌다
repo
decl 'AREAS="app"' \
  'app_PATH="."   # 루트면 "." (저장소 기준)' \
  'app_TEST="! grep -q \"FAIL\" *.js"   # 예: "npm test"' \
  'COMMIT_TYPES=""   # 예: "feat|fix" → feat(api): …'
put a.js 'ok'
check "주석에 따옴표 · 괄호 · 통과" 0 "통과" "모양이 아닌 줄"
put a.js 'FAIL'
check "이스케이프한 따옴표 · 명령이 돈다" 1 "테스트 실패" -

# --- 검사 명령이 다 빈 영역 ---------------------------------------------------
repo
decl 'AREAS="app"' 'app_PATH="."' 'app_INSTALL="true"'
put a.js 'x'
check "검사 0개 · --ci 는 멈춘다"      1 "검사 명령이 하나도 없다" - --ci
expect "검사 0개 · 주석이 없으면 AREAS 를 가리킨다" 1 "AREAS 에서 뺀다" "앞의 # 을 지운다"
expect "검사 0개 · 끝 안내가 없는 명령을 가리키지 않는다" 1 "돌다 실패한 명령은 없다" "그대로 돌려 재현"
check "검사 0개 · --ci-fast 는 멈춘다" 1 "검사 명령이 하나도 없다" - --ci-fast
# 빠른 층은 원래 테스트를 안 돌린다. 테스트만 적은 영역을 여기서 떨어뜨리면 안 된다.
repo
decl 'AREAS="app"' 'app_PATH="."' 'app_TEST="true"'
put a.js 'x'
check "테스트만 · --ci-fast 는 통과" 0 "통과" "검사 명령이 하나도 없다" --ci-fast
check "테스트만 · --ci 는 테스트를 돈다" 0 "→ 테스트" - --ci
# 층마다 도는 단계. 실패하는 테스트 · 빌드를 두고 빠른 층이 안 돌리는지 본다 (통과하는 명령이면 돌았는지 모른다)
repo
decl 'AREAS="app"' 'app_PATH="."' 'app_LINT="true"' 'app_TEST="false"' 'app_BUILD="false"'
put a.js 'x'
check "--ci-fast · 테스트를 안 돈다" 0 "통과" "→ 테스트" --ci-fast
expect "--ci-fast · 빌드를 안 돈다" 0 - "→ 빌드"
check "--ci · 테스트를 돈다"         1 "테스트 실패" - --ci
expect "--ci · 빌드도 돈다"          1 "빌드 실패" -
check "커밋 게이트 · 빌드는 안 돈다" 1 "테스트 실패" "→ 빌드"
repo
decl 'AREAS="app"' 'app_PATH="."' 'app_INSTALL="false"' 'app_TEST="true"'
put a.js 'x'
check "--ci · 설치부터 돈다"         1 "의존성 설치 실패" - --ci
check "커밋 게이트 · 설치는 안 돈다" 0 "통과" "의존성 설치"

# --- 영역 경로 모양 -----------------------------------------------------------
# git 이 주는 경로는 'web/…' 다. './web' 을 그대로 비교하면 커밋 게이트가 그 영역을 건너뛴다.
for p in 'web' './web' 'web/' './web/'; do
  repo
  decl 'AREAS="web"' "web_PATH=\"$p\"" "web_TEST=\"$T_FAIL\""
  put web/a.js 'FAIL'
  check "web_PATH=\"$p\" · 커밋이 막힌다" 1 "테스트 실패" -
done
repo
decl 'AREAS="web"' 'web_PATH="./web"' 'web_FORMAT_FIX="echo ok > fixed.txt"'
mkdir -p "$R/web" && printf 'x\n' > "$R/web/a.js" || exit 1
hook --format-only
if [ "$RC" -eq 0 ] && [ -f "$R/web/fixed.txt" ]; then
  PASS=$((PASS + 1))
else
  bad "web_PATH=\"./web\" · --format-only 가 포맷터를 돌린다 — rc=$RC"
fi
# 공백이 든 경로. status --porcelain 은 "web/a b.js" 로 감싸서 고치기 전 훅은 영역 판정이
# 빗나가 포맷터를 말없이 건너뛰었다. 포맷터는 영역 밖(저장소 루트)에 흔적을 남긴다.
# fmt_ran <설명> — --format-only 가 저장소 루트에 fixed.txt 를 남겼나
fmt_ran() {
  rm -f "$R/fixed.txt"
  hook --format-only
  if [ "$RC" -eq 0 ] && [ -f "$R/fixed.txt" ]; then
    PASS=$((PASS + 1))
  else
    bad "$1 — rc=$RC"
  fi
}
repo
decl 'AREAS="web"' 'web_PATH="web"' 'web_FORMAT_FIX="echo ok > ../fixed.txt"'
put 'web/a b.js' 'x'
fmt_ran "공백 경로 · 스테이지한 파일 · --format-only 가 포맷터를 돌린다"
git -C "$R" -c user.name=t -c user.email=t@t commit -q -m init || { echo "!! git commit 실패"; exit 1; }
printf 'y\n' >> "$R/web/a b.js" || exit 1
fmt_ran "공백 경로 · 고친 추적 파일 · --format-only 가 포맷터를 돌린다"

# --- 한글 경로 ----------------------------------------------------------------
# quotePath=true 면 git 이 "web/\355…" 로 감싸 내놓아 영역 판정이 빗나간다.
repo
decl 'AREAS="web"' 'web_PATH="web"' "web_TEST=\"$T_FAIL\""
put 'web/한글.js' 'FAIL'
check "한글 파일 · 커밋이 막힌다" 1 "테스트 실패" -
repo
decl 'AREAS="ui"' 'ui_PATH="화면"' "ui_TEST=\"$T_FAIL\""
put '화면/a.js' 'FAIL'
check "한글 폴더 · 커밋이 막힌다" 1 "테스트 실패" -
# 훅이 자기 git 호출에 붙인 설정이 stack.md 명령으로 새면, 실패한 명령을 손으로 다시 돌렸을 때 결과가 달라진다
repo
decl 'AREAS="app"' 'app_PATH="."' "app_TEST='test \"\$(git config core.quotePath)\" = true'"
put a.js 'x'
check "명령 안의 git 은 저장소 설정 그대로" 0 "통과" -

# --- 바뀐 파일이 많아도 영역을 놓치지 않는다 ----------------------------------
# 목록을 파이프로 grep -q 에 넘기면 64KB 를 넘을 때 SIGPIPE(141)가 결과가 된다.
# 작업 트리에 파일을 만들지 않고 인덱스에만 올려 빠르게 늘린다.
repo
decl 'AREAS="web"' 'web_PATH="web"' "web_TEST=\"$T_FAIL\""
put web/a.js 'FAIL'
blob="$(printf 'x\n' | git -C "$R" hash-object -w --stdin)" || { echo "!! hash-object 실패"; exit 1; }
i=0
while [ "$i" -lt 3000 ]; do
  printf '100644 %s\tweb/pad/a-long-file-name-to-make-the-staged-list-long-%05d.txt\n' "$blob" "$i"
  i=$((i + 1))
done > "$TMP/index-info" || exit 1
git -C "$R" update-index --index-info < "$TMP/index-info" || { echo "!! update-index 실패"; exit 1; }
check "바뀐 파일 3000개 · 커밋이 막힌다" 1 "테스트 실패" -

# --- 영역 이름 · 폴더 ---------------------------------------------------------
repo
decl 'AREAS="web-app"' 'web_app_PATH="."' 'web_app_TEST="true"'
put a.js 'x'
check "하이픈 이름 · 커밋이 막힌다" 1 "영역 이름" -
check "하이픈 이름 · --ci 는 멈춘다" 1 "영역 이름" - --ci
repo
decl 'AREAS="1app"' 'app_TEST="true"'
put a.js 'x'
check "숫자로 시작 · 커밋이 막힌다" 1 "영역 이름" -
# 폴더가 없으면 CI 는 멈추고 커밋은 알리기만 한다. git 은 빈 폴더를 안 담아서
# 막으면 아직 파일이 없는 영역 때문에 동료의 커밋까지 막힌다.
repo
decl 'AREAS="api"' 'api_PATH="server"' 'api_TEST="true"'
put a.js 'x'
check "없는 폴더 · --ci 는 멈춘다"   1 "폴더가 없다" - --ci
check "없는 폴더 · 커밋은 알리기만" 0 "폴더가 없다" -
# 영역마다 잡을 나눴으면 폴더가 없는 영역의 잡만 멈춘다
repo
decl 'AREAS="web api"' 'web_PATH="."' 'web_TEST="true"' 'api_PATH="server"' 'api_TEST="true"'
put a.js 'x'
check "없는 폴더 · 다른 영역 잡은 돈다" 0 "통과" "폴더가 없다" --ci web
check "없는 폴더 · 그 영역 잡은 멈춘다" 1 "폴더가 없다" - --ci api
repo
decl 'AREAS="app"' 'app_PATH="."' 'app_TEST="true"'
put a.js 'x'
check "AREAS 에 없는 영역으로 --ci" 1 "AREAS 에 없다" - --ci nope

# --- 명령을 못 찾으면 (rc=127) ------------------------------------------------
repo
decl 'AREAS="app"' 'app_PATH="."' 'app_TEST="no-such-command-for-pre-commit-test"'
put a.js 'x'
check "명령 없음 · 커밋은 GUI 힌트"       1 "GUI" -
check "명령 없음 · CI 에는 GUI 힌트 없음" 1 "테스트 실패" "GUI" --ci
expect "명령이 실패한 CI · 끝 안내는 그 명령을 다시 돌리라고 한다" 1 "그대로 돌려 재현" "돌다 실패한 명령은 없다"

# --- CI 는 실패한 명령의 출력을 다 남긴다 --------------------------------------
# 고치기 전 훅은 끝 30줄만 찍어서 앞쪽에 찍힌 원인이 잘렸다. 시간 초과로 죽으면 하나도 안 남았다.
# 표지는 돌 때 만들어진다(FIRST-2-CAUSE). 실패 줄이 찍는 명령 글자와 섞이지 않게.
repo
decl 'AREAS="app"' 'app_PATH="."' \
  "app_TEST='echo FIRST-\$((1 + 1))-CAUSE; i=0; while [ \$i -lt 40 ]; do echo pad; i=\$((i + 1)); done; false'"
put a.js 'x'
check "CI 실패 · 앞쪽 원인도 남는다" 1 "FIRST-2-CAUSE" - --ci
check "커밋 실패 · 끝 30줄로 줄인다" 1 "테스트 실패" "FIRST-2-CAUSE"

# --- 지우기만 한 커밋도 그 영역을 검사한다 -------------------------------------
# 고치기 전 훅은 지운 파일을 빼고 봐서 「바뀐 파일 없음, 통과」로 끝냈다.
repo
decl 'AREAS="web"' 'web_PATH="web"' 'web_TEST="false"'
put web/a.js 'x'
git -C "$R" -c user.name=t -c user.email=t@t commit -q --no-verify -m base || { echo "!! git commit 실패"; exit 1; }
git -C "$R" rm -q web/a.js || { echo "!! git rm 실패"; exit 1; }
check "지우기만 한 커밋 · 그 영역을 검사한다" 1 "테스트 실패" "바뀐 파일 없음"
# 다른 영역으로 옮기면 떠난 영역도 검사한다. 거기서 그 파일을 쓰던 코드가 깨질 수 있다
repo
decl 'AREAS="web api"' 'web_PATH="web"' 'api_PATH="api"' 'web_TEST="false"' 'api_TEST="true"'
put web/a.js 'x'
git -C "$R" -c user.name=t -c user.email=t@t commit -q --no-verify -m base || { echo "!! git commit 실패"; exit 1; }
mkdir -p "$R/api" && git -C "$R" mv web/a.js api/a.js || { echo "!! git mv 실패"; exit 1; }
check "영역을 옮긴 커밋 · 떠난 영역도 검사한다" 1 "[web]" -

# --- 스캐너가 없으면 CI 는 멈춘다 ----------------------------------------------
repo
decl 'AREAS="app"' 'app_PATH="."' 'app_TEST="true"'
put a.js 'x'
rm -f "$R/.claude/hooks/secret-scan.sh"
check "스캐너 없음 · --ci 는 멈춘다"      1 "secret-scan.sh 가 없다" - --ci
check "스캐너 없음 · 커밋은 알리고 통과" 0 "secret-scan.sh 가 없다" -

# --- 문서 크기: 경고와 면제 (stack.md 를 안 채워도 돈다) ----------------------
# 상한은 맨 위에서 HARNESS.md 5절 표로 읽었다. 상한까지는 조용하고 한 줄 넘으면 경고한다.
OVER_DOC=$((LIM_DOC + 1))
OVER_CLAUDE=$((LIM_CLAUDE + 1))
repo
decl 'AREAS="<채워넣기>"' 'DOC_SIZE_EXEMPT=""'
doc big.md "$LIM_DOC"
doc CLAUDE.md "$LIM_CLAUDE"
check "상한과 같은 줄 수 · 경고 없음"          0 - "(상한"
repo
decl 'AREAS="<채워넣기>"' 'DOC_SIZE_EXEMPT=""'
doc big.md "$OVER_DOC"
check "그 외 문서 ${OVER_DOC}줄 · 경고"       0 "big.md — ${OVER_DOC}줄 (상한 ${LIM_DOC}줄)" -
repo
decl 'AREAS="<채워넣기>"' 'DOC_SIZE_EXEMPT=""'
doc CLAUDE.md "$OVER_CLAUDE"
check "CLAUDE.md ${OVER_CLAUDE}줄 · 경고"     0 "CLAUDE.md — ${OVER_CLAUDE}줄 (상한 ${LIM_CLAUDE}줄)" -
# AGENTS.md 도 매번 읽힌다 (다른 AI 도구가 읽고 CLAUDE.md 가 불러온다). 하위 폴더의 것도 같다
for f in AGENTS.md web/AGENTS.md; do
  repo
  decl 'AREAS="<채워넣기>"' 'DOC_SIZE_EXEMPT=""'
  doc "$f" "$OVER_CLAUDE"
  check "$f ${OVER_CLAUDE}줄 · 경고"         0 "$f — ${OVER_CLAUDE}줄 (상한 ${LIM_CLAUDE}줄)" -
done
repo
decl 'AREAS="<채워넣기>"' 'DOC_SIZE_EXEMPT="big.md"   # 진실 문서'
doc big.md "$OVER_DOC"
check "면제 · 경고 없음"         0 - "big.md —"
repo
decl 'AREAS="<채워넣기>"' 'DOC_SIZE_EXEMPT="notes.md ./docs/SPEC.md"'
doc docs/SPEC.md "$OVER_DOC"
doc other.md "$OVER_DOC"
check "./ 붙인 면제 · 여러 개"   0 "other.md — ${OVER_DOC}줄" "SPEC.md —"
# 면제는 글자 그대로 맞춘다. * 를 펼치면 훅을 부른 폴더에 따라 결과가 바뀐다.
repo
decl 'AREAS="<채워넣기>"' 'DOC_SIZE_EXEMPT="*.md"'
doc big.md "$OVER_DOC"
check "면제는 * 를 안 펼친다"    0 "big.md — ${OVER_DOC}줄" -

# --- --changed-areas: PR 에서 바뀐 영역만 고른다 (GitHub 영역별 잡) ------------
# 🔴 모르면 전부다. 빈 목록이 나오면 영역 잡이 하나도 안 돌고 초록이 된다.
# cmt <메시지> — 스테이지한 것을 커밋한다. 전역 설정을 끊어서 이름 · 메일을 여기서 준다
cmt() {
  git -C "$R" -c user.name=t -c user.email=t@t -c commit.gpgsign=false commit -q --no-verify -m "$1" \
    || { echo "!! git commit 실패"; exit 1; }
}
repo
decl 'AREAS="web api"' 'web_PATH="web"' 'api_PATH="./api/"' 'web_TEST="true"' 'api_TEST="true"'
put web/a.js 'x'
put api/b.js 'y'
cmt base
BASE="$(git -C "$R" rev-parse HEAD)" || exit 1
put web/c.js 'z'
cmt web
check "--changed-areas · 바뀐 영역만"              0 "web" "api" --changed-areas "$BASE"
BASE="$(git -C "$R" rev-parse HEAD)" || exit 1
put api/d.js 'w'
cmt api
check "--changed-areas · ./ · 끝 / 를 붙인 경로도"   0 "api" "web" --changed-areas "$BASE"
BASE="$(git -C "$R" rev-parse HEAD)" || exit 1
put README.md 'docs'
cmt docs
hook --changed-areas "$BASE"
expect "--changed-areas · 문서만 · web 을 안 고른다" 0 - "web"
expect "--changed-areas · 문서만 · api 를 안 고른다" 0 - "api"
BASE="$(git -C "$R" rev-parse HEAD)" || exit 1
put .claude/notes.md 'harness'
cmt harness
hook --changed-areas "$BASE"
expect "--changed-areas · 하네스가 바뀌면 · web 도"  0 "web" -
expect "--changed-areas · 하네스가 바뀌면 · api 도"  0 "api" -
hook --changed-areas no-such-ref
expect "--changed-areas · 기준을 못 찾으면 · 까닭"   0 "전 영역을 고른다" -
expect "--changed-areas · 기준을 못 찾으면 · 전부"   0 "api" -
hook --changed-areas
expect "--changed-areas · 기준을 안 주면 · 전부"     0 "web" -
# 공통 조상이 없는 기준. git diff A...B 가 실패한다
EMPTY_TREE="$(git -C "$R" mktree < /dev/null)" || { echo "!! mktree 실패"; exit 1; }
ORPHAN="$(git -C "$R" -c user.name=t -c user.email=t@t commit-tree -m orphan "$EMPTY_TREE")" \
  || { echo "!! commit-tree 실패"; exit 1; }
hook --changed-areas "$ORPHAN"
expect "--changed-areas · 공통 조상이 없으면 · 까닭" 0 "공통 조상을 못 찾았다" -
expect "--changed-areas · 공통 조상이 없으면 · 전부" 0 "api" -
# CI 설정이 바뀌면 전부다
for f in .github/workflows/gate.yml .gitlab-ci.yml; do
  BASE="$(git -C "$R" rev-parse HEAD)" || exit 1
  put "$f" 'x: 1'
  cmt "ci $f"
  hook --changed-areas "$BASE"
  expect "--changed-areas · $f · 까닭" 0 "CI 설정이 바뀌었다" -
  expect "--changed-areas · $f · 전부" 0 "api" -
done
# 영역 밖이라도 문서가 아니면 전부다. 고치기 전 훅은 루트 잠금 파일만 바꾼 PR 에서 아무 영역도 안 골라
# 테스트 0개로 초록을 냈다
for f in package.json Dockerfile .gitlab/ci/build.yml; do
  BASE="$(git -C "$R" rev-parse HEAD)" || exit 1
  put "$f" 'z'
  cmt "root $f"
  hook --changed-areas "$BASE"
  expect "--changed-areas · 루트 $f · web 도" 0 "web" -
  expect "--changed-areas · 루트 $f · api 도" 0 "api" -
done
BASE="$(git -C "$R" rev-parse HEAD)" || exit 1
put docs/guide.txt 'g'
put docs/a.png 'p'
cmt "docs folder"
hook --changed-areas "$BASE"
expect "--changed-areas · docs/ 만 · web 을 안 고른다" 0 - "web"
expect "--changed-areas · docs/ 만 · api 를 안 고른다" 0 - "api"
# 루트 영역(.)은 무엇이 바뀌든 늘 고른다
repo
decl 'AREAS="app"' 'app_PATH="."' 'app_TEST="true"'
put a.js 'x'
cmt base
BASE="$(git -C "$R" rev-parse HEAD)" || exit 1
put notes.txt 'y'
cmt notes
check "--changed-areas · 루트 영역은 늘 고른다"     0 "app" - --changed-areas "$BASE"
# stack.md 가 비었거나 틀리면 고를 수 없다. 멈춰야 빈 목록으로 초록이 안 뜬다
repo
decl 'AREAS="<채워넣기>"'
put a.txt 'x'
cmt base
check "--changed-areas · 빈 stack.md 는 멈춘다"      1 "안 채워져" - --changed-areas HEAD
repo
decl 'AREAS="app"' '  app_PATH="."'
put a.txt 'x'
cmt base
check "--changed-areas · 틀린 stack.md 는 멈춘다"    1 "으로 시작하지 않는 줄" - --changed-areas HEAD

# --- §3 블록 머리가 ```sh 가 아니면 막는다 -------------------------------------
# 훅은 머리 줄이 정확히 ```sh 인 블록만 읽는다. ```bash 로 바꾸거나 뒤에 공백이 붙으면 선언을 하나도 못 읽는다.
# 고치기 전 훅은 그것을 「안 채워짐」으로 보고 커밋 게이트를 검사 없이 통과시켰다.
for head in '```bash' '```sh '; do
  repo
  { echo '# STACK'; echo "$head"; echo 'AREAS="app"'; echo 'app_PATH="."'; echo "app_TEST=\"$T_FAIL\""; echo '```'; } \
    > "$R/.claude/stack.md" || { echo "!! stack.md 쓰기 실패"; exit 1; }
  put a.js 'FAIL'
  check "머리 줄 '$head' · 커밋도 막는다" 1 "머리 줄이 정확히" "안 채워져"
  check "머리 줄 '$head' · --ci 도 멈춘다" 1 "머리 줄이 정확히" - --ci
done

# --- 커밋 게이트 · 영역 밖 파일 · stack.md 는 닿는 영역만 돈다 -------------------
# 고치기 전 훅은 .gitignore · compose.yaml 같은 영역 밖 파일이나 stack.md 를 바꾼 커밋에서 전 영역을 돌았다.
# 그 PC 에 없는 영역 도구(Terraform 등)에서 커밋이 막혔고, 한 줄 커밋에도 몇 분이 걸렸다.
# 영역 검사가 읽는 영역 밖 파일은 <영역>_ALSO_PATHS 에 적는다. 그 파일이 바뀌면 그 영역만 돈다.
repo
decl 'AREAS="web api"' 'web_PATH="web"' 'api_PATH="api"' 'web_TEST="false"' 'api_TEST="false"' \
  'web_ALSO_PATHS=".editorconfig ./.prettierrc* shared/"'
put web/a.js 'x'
put api/b.js 'y'
# 아래 「지운 파일」 사례가 쓴다. 훅은 저장소 루트에서 돈다
put .prettierrc.yaml 'y'
put .prettierrc.toml 'y'
cmt base
for f in package.json .gitignore compose.yaml; do
  git -C "$R" reset -q || exit 1
  put "$f" 'z'
  check  "커밋 게이트 · 루트 $f 만 · web 을 안 돈다" 0 "영역 검사 없음 — 바뀐 파일이 어느 영역에도 안 든다 ($f)" "[web]"
  expect "커밋 게이트 · 루트 $f 만 · api 를 안 돈다" 0 - "[api]"
done
git -C "$R" reset -q || exit 1
put README.md 'docs'
check "커밋 게이트 · 루트 문서만 · 영역을 안 돈다" 0 "통과" "[web]"
for f in .editorconfig .prettierrc.json shared/fmt.json; do
  git -C "$R" reset -q || exit 1
  put "$f" 'z'
  check  "ALSO_PATHS · $f · 그 영역을 돈다"      1 "[web]" -
  expect "ALSO_PATHS · $f · 다른 영역은 안 돈다" 1 - "[api]"
done
# 지운 설정 파일도 그 영역이다. 패턴을 루트의 파일 이름으로 펼치면 남은 .prettierrc.yaml 로 바뀌어
# 지운 .prettierrc.toml 을 못 맞춘다
git -C "$R" reset -q || exit 1
git -C "$R" rm -q .prettierrc.toml || exit 1
check "ALSO_PATHS · 지운 파일 · 그 영역을 돈다" 1 "[web]" -
# 저장소 루트 기준으로 맞춘다. 다른 폴더의 같은 이름은 그 영역이 아니다
git -C "$R" reset -q || exit 1
put tools/.editorconfig 'z'
check "ALSO_PATHS · 다른 폴더의 같은 이름은 아니다" 0 "영역 검사 없음" "[web]"
# CI 영역 고르기도 ALSO_PATHS 파일은 그 영역으로 친다. 그 밖의 영역 밖 파일은 지금처럼 전부다 (위 --changed-areas 사례)
git -C "$R" reset -q || exit 1
BASE="$(git -C "$R" rev-parse HEAD)" || exit 1
put .editorconfig 'w'
cmt editorconfig
hook --changed-areas "$BASE"
expect "--changed-areas · ALSO_PATHS 파일 · 그 영역만" 0 "web" "api"
# HEAD 에 없던 stack.md 는 모든 선언이 새것이라 모든 영역을 돈다
git -C "$R" add .claude/stack.md || exit 1
check  "커밋 게이트 · 새 stack.md · 모든 영역을 돈다" 1 "stack.md 에서 커밋 검사 선언이 바뀐 영역도 돈다 — web api" -
expect "커밋 게이트 · 새 stack.md · api 도 돈다"     1 "[api]" -
# stack.md 로 고른 영역도 폴더가 없으면 건너뛴다. 돌리면 cd 에서 실패해 커밋이 막힌다 (5단계가 이미 알린다)
repo
decl 'AREAS="web api"' 'web_PATH="web"' 'api_PATH="server"' 'web_TEST="true"' 'api_TEST="true"'
put web/a.js 'x'
cmt base
git -C "$R" add .claude/stack.md || exit 1
check "stack.md 로 고른 영역 · 폴더가 없으면 건너뛴다" 0 "[web]" "[api]"

# ALSO_PATHS 로 고른 영역도 폴더가 없으면 건너뛴다
repo
decl 'AREAS="web api"' 'web_PATH="web"' 'web_TEST="true"' 'api_PATH="server"' 'api_ALSO_PATHS="pyproject.toml"' 'api_TEST="true"'
put web/a.js 'x'
cmt base
put pyproject.toml 'x'
check "ALSO_PATHS 로 고른 영역 · 폴더가 없으면 건너뛴다" 0 "폴더가 없다" "[api]"
# ALSO_PATHS 를 본 뒤에도 명령 속 * 는 펼쳐진다. set -f 가 새면 '! grep -q FAIL *.js' 가 파일을 못 찾고
# ! 가 그 실패를 뒤집어, FAIL 이 든 커밋이 통과한다
repo
decl 'AREAS="api web"' 'api_PATH="api"' 'api_ALSO_PATHS="x.cfg"' 'api_TEST="true"' 'web_PATH="web"' "web_TEST=\"$T_FAIL\""
put api/b.js 'y'
put web/a.js 'ok'
cmt base
put web/a.js 'FAIL'
check "ALSO_PATHS 를 본 뒤 · 명령 속 * 는 펼쳐진다" 1 "테스트 실패" -
# 포맷 전용 모드는 ALSO_PATHS 를 안 본다. 그 모드는 작업 폴더에 떠 있는 파일을 다 보므로,
# 안 올린 영역 밖 파일 하나 때문에 편집할 때마다 다른 영역의 포맷터가 돌면 안 된다
repo
decl 'AREAS="web api"' 'web_PATH="web"' 'web_ALSO_PATHS=".editorconfig"' 'web_FORMAT_FIX="echo ok > ../fixed.txt"' \
  'api_PATH="api"'
put web/a.js 'x'
put api/b.js 'y'
cmt base
printf 'root = true\n' > "$R/.editorconfig" || exit 1
printf 'z\n' >> "$R/api/b.js" || exit 1
rm -f "$R/fixed.txt"
hook --format-only
if [ "$RC" -eq 0 ] && [ ! -f "$R/fixed.txt" ]; then
  PASS=$((PASS + 1))
else
  bad "포맷 전용 · 안 올린 ALSO_PATHS 파일 · 다른 영역의 포맷터를 안 돌린다 — rc=$RC"
fi

# stack.md 는 §3 블록에서 바뀐 선언이 닿는 영역만 돈다. 고친 명령을 한 번도 안 돌린 채 커밋하지 않게.
# HEAD 와 스테이지된 stack.md 를 비교한다. 블록 밖 글 · 주석 · CR · 선언 뒤 설명만 바뀌면 영역을 안 돈다.
# 누가 읽는지 확실할 때만 좁힌다 — 값에 나오는 이름 · 공용 변수 · 순서 · 같은 이름 두 번은 모든 영역이다.
# 커밋 검사가 안 돌리는 영역 선언(_BUILD · _RUN · _ALSO_PATHS …)과 훅 설정(COMMIT_TYPES …)만 바뀌면 영역을 안 돈다.
STK=('AREAS="web api"' 'web_PATH="web"' 'api_PATH="api"' "web_LINT='true \$DEFAULT_BRANCH'" "web_TEST='false \$FLAGS'"
     'api_TEST="false"' "api_LINT='true \$LIBX'" 'FLAGS="-x"' "LIBX='\${#BASEV}'" 'BASEV="1"' 'TOOL_OPTS="good"'
     'COMMIT_TYPES="feat|fix"' 'DEFAULT_BRANCH="dev"' 'web_BUILD="true"' 'web_RUN="true"' 'web_ALSO_PATHS="a.cfg"')
repo
decl "${STK[@]}"
put web/a.js 'x'
put api/b.js 'y'
git -C "$R" add .claude/stack.md || exit 1
cmt base
# stk_case <설명> <기대 rc> <있어야 할 말|-> <없어야 할 말|-> <바꿀 줄> <새 줄|-> — STK 의 한 줄을 바꿔(-면 지워)
# stack.md 를 다시 쓰고 스테이지한 뒤 훅을 돌린다
stk_case() {
  local label="$1" wrc="$2" yes="$3" no="$4" from="$5" to="$6" l lines=()
  for l in "${STK[@]}"; do
    if [ "$l" = "$from" ]; then [ "$to" = - ] || lines+=("$to"); else lines+=("$l"); fi
  done
  decl "${lines[@]}"
  git -C "$R" add .claude/stack.md || { echo "!! git add 실패: stack.md"; exit 1; }
  check "$label" "$wrc" "$yes" "$no"
}
stk_case "stack.md · web_ 검사 줄을 고침 · web 만 돈다" 1 "[web]" "[api]" "web_TEST='false \$FLAGS'" "web_TEST='false \$FLAGS -y'"
expect   "stack.md · web_ 검사 줄을 고침 · 까닭을 찍는다" 1 "stack.md 에서 커밋 검사 선언이 바뀐 영역도 돈다 — web" -
stk_case "stack.md · web_ 검사 줄을 지움 · web 만 돈다" 1 "[web]" "[api]" "web_LINT='true \$DEFAULT_BRANCH'" -
# 값에 나오는 이름은 부르는 꼴이 여러 가지라($X · ${#X} …) 누가 읽는지 다 못 따라간다
stk_case "stack.md · \$이름 으로 부르는 변수 · 모든 영역" 1 "FLAGS 이(가) 선언의 값에 나온다" - 'FLAGS="-x"' 'FLAGS="-z"'
expect   "stack.md · \$이름 으로 부르는 변수 · api 도 돈다" 1 "[api]" -
stk_case "stack.md · \${#이름} 으로 부르는 변수 · 모든 영역" 1 "BASEV 이(가) 선언의 값에 나온다" - 'BASEV="1"' 'BASEV="22"'
expect   "stack.md · \${#이름} 으로 부르는 변수 · web 도 돈다" 1 "[web]" -
stk_case "stack.md · 영역이 부르는 훅 설정 · 모든 영역" 1 "DEFAULT_BRANCH 이(가) 선언의 값에 나온다" - \
  'DEFAULT_BRANCH="dev"' 'DEFAULT_BRANCH="main"'
# 값에 안 나와도 셸이 내보낸 이름(PATH 등)이면 명령의 환경으로 넘어간다
stk_case "stack.md · 아무도 안 부르는 공용 변수 · 모든 영역" 1 "공용 변수 TOOL_OPTS" - 'TOOL_OPTS="good"' 'TOOL_OPTS="bad"'
expect   "stack.md · 아무도 안 부르는 공용 변수 · api 도 돈다" 1 "[api]" -
stk_case "stack.md · 영역이 안 부르는 훅 설정 · 영역 검사 없음" 0 "커밋 검사가 쓰는 선언은 그대로다" "[web]" \
  'COMMIT_TYPES="feat|fix"' 'COMMIT_TYPES="feat|fix|docs"'
expect   "stack.md · 영역이 안 부르는 훅 설정 · api 도 안 돈다" 0 - "[api]"
stk_case "stack.md · 커밋 검사가 안 돌리는 _BUILD · 영역 검사 없음" 0 "커밋 검사가 쓰는 선언은 그대로다" "[web]" \
  'web_BUILD="true"' 'web_BUILD="false"'
stk_case "stack.md · 커밋 검사가 안 돌리는 _RUN · 영역 검사 없음" 0 "커밋 검사가 쓰는 선언은 그대로다" "[web]" \
  'web_RUN="true"' 'web_RUN="false"'
stk_case "stack.md · _ALSO_PATHS 만 · 영역 검사 없음" 0 "커밋 검사가 쓰는 선언은 그대로다" "[web]" \
  'web_ALSO_PATHS="a.cfg"' 'web_ALSO_PATHS="a.cfg b.cfg"'
stk_case "stack.md · 선언 뒤 설명만 · 영역 검사 없음" 0 "커밋 검사가 쓰는 선언은 그대로다" "[api]" \
  'BASEV="1"' 'BASEV="1"   # 설명만 더함'
decl "${STK[@]}" '# 블록 안 주석만 더함'
git -C "$R" add .claude/stack.md || exit 1
check "stack.md · 블록 안 주석만 · 영역 검사 없음" 0 "커밋 검사가 쓰는 선언은 그대로다" "[web]"
decl "${STK[@]}"
printf '\n## 블록 밖 글\n\n| 표 | x=1 |\n' >> "$R/.claude/stack.md" || exit 1
git -C "$R" add .claude/stack.md || exit 1
check "stack.md · 블록 밖 글만 · 영역 검사 없음" 0 "커밋 검사가 쓰는 선언은 그대로다" "[web]"
# sed -i 는 BSD sed 와 문법이 달라 awk 로 쓴다 (test-upgrade.sh 와 같다)
decl "${STK[@]}"
awk '{ printf "%s\r\n", $0 }' "$R/.claude/stack.md" > "$R/stack.crlf" && mv "$R/stack.crlf" "$R/.claude/stack.md" || exit 1
git -C "$R" add .claude/stack.md || exit 1
check "stack.md · 줄바꿈(CRLF)만 · 영역 검사 없음" 0 "커밋 검사가 쓰는 선언은 그대로다" "[web]"
# 큰따옴표 값은 읽는 순서에 따라 펼쳐진 값이 달라진다. 같은 이름을 두 번 적으면 순서가 값을 정한다
decl "${STK[@]:1}" "${STK[0]}"
git -C "$R" add .claude/stack.md || exit 1
check  "stack.md · 선언 순서만 · 모든 영역" 1 "선언 순서가 바뀌었다" -
expect "stack.md · 선언 순서만 · api 도 돈다" 1 "[api]" -
decl "${STK[@]}" 'web_RUN="true"'
git -C "$R" add .claude/stack.md || exit 1
check  "stack.md · 같은 이름 두 번 · 모든 영역" 1 "같은 이름을 두 번 적은 선언이 있다" -
expect "stack.md · 같은 이름 두 번 · api 도 돈다" 1 "[api]" -
# AREAS 에 새로 넣은 영역은 그 영역 줄이 그대로여도 돈다
repo
decl 'AREAS="web"' 'web_PATH="web"' 'api_PATH="api"' 'web_TEST="false"' 'api_TEST="false"'
put web/a.js 'x'
put api/b.js 'y'
git -C "$R" add .claude/stack.md || exit 1
cmt base
decl 'AREAS="web api"   # api 를 더함' 'web_PATH="web"' 'api_PATH="api"' 'web_TEST="false"' 'api_TEST="false"'
git -C "$R" add .claude/stack.md || exit 1
check "stack.md · AREAS 에 새 영역 · 그 영역만 돈다" 1 "[api]" "[web]"

# --- 커밋 게이트 · 하네스 훅 · settings.json 이 바뀌면 그 파일을 확인하는 하네스 테스트를 돈다 -----
# 고치기 전 훅은 이때 전 영역을 돌았다. 고친 훅을 한 번은 돌려 본 채로 커밋하게 하려면 훅의 회귀 테스트가 맞다.
# 하네스 전체(run.sh)는 10분쯤 걸려 그 파일 이름을 본문에 적은 테스트 파일만 돈다.
repo
decl 'AREAS="web"' 'web_PATH="web"' 'web_TEST="false"'
put web/a.js 'x'
cmt base
mkdir -p "$R/.claude/hooks/tests" || exit 1
# hstub <테스트 파일> <본문에 적을 이름> <끝 코드> — 그 이름을 본문에 적은 가짜 하네스 테스트를 만든다
hstub() {
  printf '#!/usr/bin/env bash\n# 보는 것: %s\nexit %s\n' "$2" "$3" > "$R/.claude/hooks/tests/$1" || exit 1
}
hstub test-commit-msg.sh commit-msg 0
hstub test-deny-sync.sh settings.json 0
hstub test-other.sh nothing 1
put .claude/hooks/commit-msg 'x'
check  "하네스 훅 · 그 훅을 적은 테스트를 돈다"      0 "→ 하네스 검사 test-commit-msg.sh" "[web]"
expect "하네스 훅 · 다른 테스트는 안 돈다"           0 - "test-other.sh"
expect "하네스 훅 · ALSO_PATHS 에 적으라고 하지 않는다" 0 "영역 검사 없음 — 바뀐 영역이 없다" "ALSO_PATHS"
git -C "$R" reset -q || exit 1
put .claude/settings.json '{}'
check  "settings.json · 그 이름을 적은 테스트를 돈다" 0 "→ 하네스 검사 test-deny-sync.sh" "[web]"
hstub test-deny-sync.sh settings.json 1
check  "하네스 테스트가 실패하면 막는다"             1 "하네스 검사 test-deny-sync.sh 실패" -
git -C "$R" reset -q || exit 1
git -C "$R" add .claude/hooks/tests/test-other.sh || exit 1
check  "하네스 테스트 파일을 고침 · 그 파일을 돈다"   1 "하네스 검사 test-other.sh 실패" -
git -C "$R" reset -q || exit 1
put .claude/hooks/lonely.sh 'x'
check  "확인하는 테스트가 없는 하네스 파일 · 알리고 넘어간다" 0 "lonely.sh 를 확인하는 하네스 테스트가 없다" -
git -C "$R" reset -q || exit 1
put .claude/skills/x/data.csv 'x'
check "하네스 밖 .claude 파일 · 하네스 검사도 영역 검사도 없다" 0 "영역 검사 없음" "[하네스]"

# --- git commit -a · git commit <경로> 때 훅이 받은 저장소 변수가 명령으로 새지 않는다 ---
# git 은 훅에 GIT_INDEX_FILE 을 넘긴다. 고치기 전 훅은 그것을 명령에 그대로 넘겨서, 임시 저장소를 만들어
# 커밋하는 테스트가 바깥 저장소의 인덱스에 썼다. 커밋이 「invalid object · Error building trees」로 막혔다.
for how in all path; do
  repo
  cp "$HOOK" "$R/.claude/hooks/pre-commit" || { echo "!! pre-commit 복사 실패"; exit 1; }
  decl 'AREAS="app"' 'app_PATH="."' \
    "app_TEST='git init -q \"\$LEAK\" && echo hi > \"\$LEAK/leak.txt\" && git -C \"\$LEAK\" add leak.txt && git -C \"\$LEAK\" -c user.name=t -c user.email=t@t commit -qm t'"
  put a.js 'x'
  put b.js 'x'
  cmt base
  git -C "$R" config core.hooksPath .claude/hooks || exit 1
  printf 'y\n' >> "$R/a.js" && printf 'y\n' >> "$R/b.js" || exit 1
  if [ "$how" = all ]; then args=(-am change); want_files="a.js b.js "; else args=(-m change a.js); want_files="a.js "; fi
  OUT="$( cd "$R" && LEAK="$TMP/leak-$how" git -c user.name=t -c user.email=t@t -c commit.gpgsign=false commit -q "${args[@]}" 2>&1 )"; RC=$?
  expect "git commit ($how) · 명령 속 임시 저장소가 바깥 커밋을 안 깬다" 0 "통과" "invalid object"
  # 새 커밋이 안 생겼으면 HEAD~1 이 없어 빈 값이 된다. 임시 저장소의 leak.txt 가 섞여도 여기서 보인다
  got="$(git -C "$R" diff --name-only HEAD~1 HEAD 2>/dev/null | tr '\n' ' ')"
  if [ "$got" = "$want_files" ]; then
    PASS=$((PASS + 1))
  else
    bad "git commit ($how) · 커밋에 든 파일 '$got' (기대 '$want_files')"
  fi
done

# --- 시크릿 스캔을 부른다 -----------------------------------------------------
# with_scan — 지금 저장소에 스캐너를 넣는다
with_scan() {
  mkdir -p "$R/.claude/hooks" || exit 1
  cp "$HOOKS/secret-scan.sh" "$R/.claude/hooks/" || { echo "!! secret-scan.sh 복사 실패"; exit 1; }
}
# put_env — 이름만으로 막히는 파일을 스테이지한다. 전역 gitignore 가 *.env 를 빼도 들어가게 -f
put_env() {
  printf 'X=1\n' > "$R/deploy.env" || { echo "!! 쓰기 실패: deploy.env"; exit 1; }
  git -C "$R" add -f -- deploy.env || { echo "!! git add 실패: deploy.env"; exit 1; }
}
repo
with_scan
decl 'AREAS="<채워넣기>"'
put a.txt 'hello'
check "시크릿 스캔이 돌았다고 찍는다" 0 "→ 시크릿 스캔" -
put_env
check "빈 stack.md · 시크릿이면 막는다" 1 "위 시크릿 문제를 먼저 해결할 것" -
# 영역 검사가 다 통과하고 시크릿만 걸렸을 때. 고치기 전 훅은 끝에 --no-verify 를 권했다.
repo
with_scan
decl 'AREAS="app"' 'app_PATH="."' 'app_TEST="true"'
put_env
check "시크릿만 걸림 · --no-verify 를 권하지 않는다" 1 "위 시크릿 문제를 먼저 해결할 것" "정말 급하면"
# 시크릿이 아닌 실패는 예전 안내 그대로다
repo
with_scan
decl 'AREAS="app"' 'app_PATH="."' "app_TEST=\"$T_FAIL\""
put a.js 'FAIL'
check "테스트만 실패 · 예전 안내" 1 "FORMAT_FIX" "시크릿 문제"
# 영역을 좁힌 CI 잡은 스캔을 건너뛴다. 저장소 전체 스캔은 늘 도는 잡이 따로 맡는다.
# 영역을 안 좁혔거나 로컬이면 그대로 돈다 — 그 잡이 없는 자리라서다.
repo
with_scan
decl 'AREAS="app"' 'app_PATH="."' 'app_TEST="true"'
put a.js 'x'
for v in GITLAB_CI GITHUB_ACTIONS; do
  OUT="$( cd "$R" && env "$v=true" bash "$HOOK" --ci app 2>&1 )"; RC=$?
  expect "$v · 영역 잡은 스캔을 건너뛴다"       0 "시크릿 스캔 건너뜀" -
  OUT="$( cd "$R" && env "$v=true" bash "$HOOK" --ci 2>&1 )"; RC=$?
  expect "$v · 영역을 안 좁히면 스캔한다"       0 "→ 시크릿 스캔" "건너뜀"
done
OUT="$( cd "$R" && env GITHUB_ACTIONS=false bash "$HOOK" --ci app 2>&1 )"; RC=$?
expect "GITHUB_ACTIONS=false · 영역 잡도 스캔한다" 0 "→ 시크릿 스캔" "건너뜀"
# SCAN_BASE 를 주면 그 뒤 커밋 이력도 본다. 마지막 트리에는 없는 비밀 파일을 이력에서 잡는다
repo
with_scan
decl 'AREAS="app"' 'app_PATH="."' 'app_TEST="true"'
put a.js 'x'
cmt base
SB="$(git -C "$R" rev-parse HEAD)" || exit 1
put_env
cmt env-add
git -C "$R" rm -q deploy.env || { echo "!! git rm 실패"; exit 1; }
cmt env-remove
check "SCAN_BASE 없음 · 마지막 트리만 본다" 0 "통과" "이력에"  --ci
OUT="$( cd "$R" && SCAN_BASE="$SB" bash "$HOOK" --ci 2>&1 )"; RC=$?
expect "SCAN_BASE · 지운 비밀 파일을 이력에서 잡는다" 1 "이력에 커밋하면 안 되는 파일: deploy.env" -
OUT="$( cd "$R" && SCAN_BASE=0000000000000000000000000000000000000000 bash "$HOOK" --ci 2>&1 )"; RC=$?
expect "SCAN_BASE 를 못 찾으면 멈춘다" 1 "fetch-depth: 0" -

echo "-- 통과 $PASS · 실패 $FAIL ----------------------"
[ "$FAIL" -eq 0 ] || exit 1
