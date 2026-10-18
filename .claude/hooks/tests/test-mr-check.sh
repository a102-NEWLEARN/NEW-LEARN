#!/usr/bin/env bash
#
# mr-check.sh 회귀 테스트. 임시 저장소와 가짜 origin 에서만 돌고 이 저장소 파일은 건드리지 않는다.
#
#   bash .claude/hooks/tests/test-mr-check.sh
#
# CI 변수는 사례마다 직접 넘긴다. 이 테스트를 CI 안에서 돌리면 그 CI 의 변수가 섞이므로 먼저 지운다.
# rc 와 출력을 같이 본다. 막히긴 했는데 엉뚱한 까닭으로 막힌 것도 실패로 친다.

set -uo pipefail
# 개발 PC 의 전역 git 설정(서명 · 훅 경로 등)이 결과를 흔들지 않게 끊는다
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
unset CI GITLAB_CI GITHUB_ACTIONS GITHUB_HEAD_REF GITHUB_BASE_REF \
      CI_MERGE_REQUEST_SOURCE_BRANCH_NAME CI_MERGE_REQUEST_TARGET_BRANCH_NAME CI_MERGE_REQUEST_TITLE

HOOKS="$(cd "$(dirname "$0")/.." && pwd)"
for f in mr-check.sh commit-msg; do
  [ -f "$HOOKS/$f" ] || { echo "!! $f 를 못 찾았다: $HOOKS/$f"; exit 1; }
done

TMP="$(mktemp -d)" || exit 1
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0

g() { git -c user.name=t -c user.email=t@t -c commit.gpgsign=false "$@"; }

# 가짜 origin — main 에 커밋 하나
git init -q --bare "$TMP/origin.git" || exit 1
git -C "$TMP/origin.git" symbolic-ref HEAD refs/heads/main || exit 1
git init -q "$TMP/seed" || exit 1
git -C "$TMP/seed" symbolic-ref HEAD refs/heads/main || exit 1
g -C "$TMP/seed" commit -q --allow-empty -m "기준" || exit 1
g -C "$TMP/seed" push -q "$TMP/origin.git" main || exit 1

# place <이름> <선언…> — 저장소에 훅 둘과 stack.md 를 놓는다
place() {
  local d="$TMP/$1"; shift
  mkdir -p "$d/.claude/hooks" || exit 1
  cp "$HOOKS/mr-check.sh" "$HOOKS/commit-msg" "$d/.claude/hooks/" || exit 1
  { echo '```sh'; printf '%s\n' "$@"; echo '```'; } > "$d/.claude/stack.md" || exit 1
}

# mk <이름> <브랜치> <선언…> — origin 을 받아 브랜치를 만들고 훅을 놓는다
mk() {
  local name="$1" b="$2"; shift 2
  git clone -q "$TMP/origin.git" "$TMP/$name" || { echo "!! clone 실패"; exit 1; }
  g -C "$TMP/$name" checkout -q -b "$b" || exit 1
  place "$name" "$@"
}

# c <이름> <제목…> — 빈 커밋을 제목대로 만든다. 훅을 거치지 않는다
c() {
  local d="$TMP/$1" t; shift
  for t in "$@"; do g -C "$d" commit -q --allow-empty --no-verify -m "$t" || exit 1; done
}

# run <설명> <기대 rc> <있어야 할 말|-> <없어야 할 말|-> <이름> [변수=값 …]
# 있어야 할 말은 '|' 로 여러 개를 줄 수 있다. 한 출력에 전부 나와야 통과다.
run() {
  local label="$1" wrc="$2" yes="$3" no="$4" d="$TMP/$5" out rc y; shift 5
  out="$( cd "$d" && env "$@" bash .claude/hooks/mr-check.sh 2>&1 )"; rc=$?
  if [ "$rc" -ne "$wrc" ]; then
    FAIL=$((FAIL + 1)); printf '  x %s — rc=%s (기대 %s)\n' "$label" "$rc" "$wrc"
    printf '%s\n' "$out" | sed 's/^/      /'; return
  fi
  if [ "$yes" != "-" ]; then
    while IFS= read -r y; do
      [ -n "$y" ] || continue
      case "$out" in
        *"$y"*) ;;
        *) FAIL=$((FAIL + 1)); printf "  x %s — 출력에 '%s' 가 없다\n" "$label" "$y"
           printf '%s\n' "$out" | sed 's/^/      /'; return ;;
      esac
    done <<< "$(printf '%s' "$yes" | tr '|' '\n')"
  fi
  if [ "$no" != "-" ]; then
    case "$out" in
      *"$no"*) FAIL=$((FAIL + 1)); printf "  x %s — 출력에 '%s' 가 있으면 안 된다\n" "$label" "$no"
               printf '%s\n' "$out" | sed 's/^/      /'; return ;;
    esac
  fi
  PASS=$((PASS + 1))
}

# --- 비운 선언은 아무것도 안 본다 -------------------------------------------
mk empty wip 'COMMIT_TYPES=""' 'COMMIT_ISSUE_KEY=""' 'BRANCH_TYPES=""'
c empty "아무 말" "#12 해시"
run "빈 선언"                          0 "적은 규칙이 없어" - empty

# --- 커밋 제목은 commit-msg 에 태운다 ---------------------------------------
mk types feat/a 'COMMIT_TYPES="feat|fix"'
c types "#12 버그 고침" "Merge 사람이 쓴 제목" "feat: 정상"
g -C "$TMP/types" checkout -q main || exit 1
c types "fix: main 쪽 커밋"
g -C "$TMP/types" checkout -q feat/a || exit 1
g -C "$TMP/types" merge -q --no-ff --no-edit main || exit 1
run "# 제목 · 사람이 쓴 Merge 는 잡고 진짜 병합은 건너뛴다" \
                                       1 "#12 버그 고침|Merge 사람이 쓴 제목|실패 2건" "Merge branch" types

# --- 브랜치 이름 -----------------------------------------------------------
mk br1 wip 'BRANCH_TYPES="feat|fix"'
c br1 "아무 말"
run "타입이 없는 브랜치 이름"          1 "브랜치 이름이" - br1
mk br2 feat/PROJ-12-login 'BRANCH_TYPES="feat|fix"'
c br2 "아무 말"
run "타입 뒤는 자유"                   0 "규칙 검사 통과" - br2

# --- 이슈키 번호 대조 -------------------------------------------------------
mk key1 feat/PROJ-12-login 'COMMIT_ISSUE_KEY="PROJ"'
c key1 "로그인 [PROJ-13]"
run "커밋 번호가 브랜치와 다르다"      1 "이슈키가 브랜치와 다르다" - key1
mk key2 feat/PROJ-12-login 'COMMIT_ISSUE_KEY="PROJ"'
c key2 "a [PROJ-12] [PROJ-13]" "b [PROJ-13] [PROJ-12]" "c 키 없음"
run "키가 여럿이면 하나만 맞아도 된다" 0 "규칙 검사 통과" - key2
run "MR 제목 번호가 브랜치와 다르다"   1 "MR 제목의 이슈키가" - key2 "CI_MERGE_REQUEST_TITLE=로그인 [PROJ-14]"
# 브랜치 이름의 키를 소문자로 써도 대조한다. 고치기 전에는 번호를 못 읽어 대조가 말없이 꺼졌다
mk key3 feat/proj-12-login 'COMMIT_ISSUE_KEY="PROJ"'
c key3 "로그인 [PROJ-13]"
run "소문자 브랜치 키도 번호를 대조한다" 1 "이슈키가 브랜치와 다르다" - key3

# --- 합치지 않은 고침 커밋 ---------------------------------------------------
# 로컬 훅은 fixup! 을 건너뛴다(나중에 합칠 커밋). MR 은 마지막 관문이라 막는다
mk fixup feat/a 'COMMIT_TYPES="feat|fix"'
c fixup "feat: 로그인" "fixup! feat: 로그인"
run "fixup! 커밋이 남은 MR"            1 "합치지 않은 고침 커밋" - fixup

# --- 커밋이 없으면 실패다 ----------------------------------------------------
mk zero feat/z 'COMMIT_TYPES="feat|fix"'
run "검사할 커밋이 없는 MR"            1 "검사할 커밋이 없다" - zero

# --- 기본 브랜치가 main 이 아닐 때 --------------------------------------------
# develop 에만 있는 커밋을 이 MR 의 커밋으로 세면 남의 제목으로 실패한다
g -C "$TMP/seed" checkout -q -b develop || exit 1
g -C "$TMP/seed" commit -q --allow-empty -m "develop 쪽 규칙 밖 제목" || exit 1
g -C "$TMP/seed" push -q "$TMP/origin.git" develop || exit 1
mk dev feat/d 'COMMIT_TYPES="feat|fix"' 'DEFAULT_BRANCH="develop"'
g -C "$TMP/dev" reset -q --hard origin/develop || exit 1
c dev "feat: develop 위의 일"
run "DEFAULT_BRANCH=develop 이면 develop 기준으로 센다" 0 "커밋 1개" - dev

# --- MR 제목 ---------------------------------------------------------------
mk title feat/a 'COMMIT_TYPES="feat|fix"'
c title "feat: 로그인"
run "Draft: 는 떼고 본다"              0 "규칙 검사 통과" - title "CI_MERGE_REQUEST_TITLE=Draft: feat: 로그인"
run "[Draft] 는 떼고 본다"             0 "규칙 검사 통과" - title "CI_MERGE_REQUEST_TITLE=[Draft] feat: 로그인"
run "(Draft) 는 떼고 본다"             0 "규칙 검사 통과" - title "CI_MERGE_REQUEST_TITLE=(Draft) feat: 로그인"
run "draft: 는 떼고 본다"              0 "규칙 검사 통과" - title "CI_MERGE_REQUEST_TITLE=draft: feat: 로그인"
run "틀린 MR 제목"                     1 "MR 제목|타입이 목록에 없다" - title "CI_MERGE_REQUEST_TITLE=로그인 추가"
run "# 로 시작하는 MR 제목"            1 "MR 제목|제목: #12 로그인" - title "CI_MERGE_REQUEST_TITLE=#12 로그인"

# --- GitHub PR 처럼 분리된 HEAD 에서 ------------------------------------------
mk gh feat/login 'COMMIT_TYPES="feat|fix"' 'BRANCH_TYPES="feat|fix"'
c gh "feat: 로그인"
g -C "$TMP/gh" checkout -q --detach || exit 1
run "GitHub 변수로 브랜치를 읽는다"    0 "브랜치 feat/login" - gh CI=true GITHUB_HEAD_REF=feat/login GITHUB_BASE_REF=main
run "CI 인데 브랜치를 모른다"          1 "브랜치 이름을 못 읽었다" - gh CI=true
run "로컬 · 브랜치 검사만 건너뛴다"    0 "건너뛴다" - gh
# GitHub 게이트는 checkout 에 토큰을 안 남긴다. fetch-depth: 0 이 받아 둔 origin/main 을 쓰고 다시 받지 않는다.
# origin 주소를 없는 곳으로 바꿔서, 다시 받으려 들면 실패하게 한다
git -C "$TMP/gh" remote set-url origin "$TMP/no-such-origin.git" || exit 1
run "GitHub · 받아 둔 origin/main 을 쓴다" 0 "규칙 검사 통과" - gh \
  CI=true GITHUB_ACTIONS=true GITHUB_HEAD_REF=feat/login GITHUB_BASE_REF=main
run "GitLab · 늘 새로 받는다"          1 "못 받았다" - gh \
  CI=true GITLAB_CI=true CI_MERGE_REQUEST_SOURCE_BRANCH_NAME=feat/login CI_MERGE_REQUEST_TARGET_BRANCH_NAME=main

# --- 얕은 클론 --------------------------------------------------------------
mk deep feat/x 'COMMIT_TYPES="feat|fix"'
c deep "bad title one" "feat: 둘" "feat: 셋"
g -C "$TMP/deep" push -q origin feat/x || exit 1
git clone -q --no-local --depth 1 --branch feat/x "$TMP/origin.git" "$TMP/shallow" || exit 1
place shallow 'COMMIT_TYPES="feat|fix"'
run "얕은 클론도 MR 의 커밋을 전부 본다" 1 "bad title one" - shallow \
  CI=true CI_MERGE_REQUEST_SOURCE_BRANCH_NAME=feat/x CI_MERGE_REQUEST_TARGET_BRANCH_NAME=main

# --- origin 을 안 받은 로컬 --------------------------------------------------
git init -q "$TMP/noorigin" || exit 1
git -C "$TMP/noorigin" symbolic-ref HEAD refs/heads/feat/a || exit 1
c noorigin "feat: 하나"
place noorigin 'COMMIT_TYPES="feat|fix"'
run "origin/main 이 없으면 fetch 하라고 한다" 1 "git fetch" - noorigin

# --- 선언을 잘못 적으면 한 번만 멈춘다 ---------------------------------------
mk bad1 feat/a 'COMMIT_TYPES="feat fix"'
c bad1 "feat: 하나" "feat: 둘"
run "타입 선언 오류는 커밋마다 찍지 않는다" 1 "형식에 안 맞는다: COMMIT_TYPES" "!! 커밋" bad1
mk bad2 feat/a 'BRANCH_TYPES="feat fix"'
c bad2 "아무 말"
run "브랜치 선언 오류"                 1 "형식에 안 맞는다: BRANCH_TYPES" - bad2
mk bad3 feat/a 'BRANCH_TYPES=feat|fix'
c bad3 "아무 말"
run "따옴표 없는 선언"                 1 "큰따옴표" - bad3

echo "-- 통과 $PASS · 실패 $FAIL ----------------------"
[ "$FAIL" -eq 0 ] || exit 1
