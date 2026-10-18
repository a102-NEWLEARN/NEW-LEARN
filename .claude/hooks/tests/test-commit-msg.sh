#!/usr/bin/env bash
#
# commit-msg 회귀 테스트. 임시 git 저장소에서만 돌고 이 저장소 파일은 건드리지 않는다.
#
#   bash .claude/hooks/tests/test-commit-msg.sh
#
# 첫 사례가 「비우면 아무것도 안 막는다」인 까닭: 템플릿은 커밋 규칙을 정하지 않는다.
# 이게 깨지면 규칙을 정하지 않은 팀도 설치하자마자 커밋이 막힌다.
#
# rc 와 출력을 같이 본다. 막히긴 했는데 엉뚱한 까닭으로 막힌 것도 실패로 친다.

set -uo pipefail
# 개발 PC 의 전역 git 설정(서명 · 주석 문자 등)이 결과를 흔들지 않게 끊는다
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

HOOK="$(cd "$(dirname "$0")/.." && pwd)/commit-msg"
[ -f "$HOOK" ] || { echo "!! commit-msg 를 못 찾았다: $HOOK"; exit 1; }

TMP="$(mktemp -d)" || exit 1
trap 'rm -rf "$TMP"' EXIT
R="$TMP/r"
git init -q "$R" || { echo "!! git init 실패"; exit 1; }
mkdir -p "$R/.claude" || exit 1
# 전역 설정이 편집기 경로 결과를 바꾸지 않게 이 저장소에 못 박는다
git -C "$R" config core.commentChar '#' || exit 1

PASS=0
FAIL=0

# decl <stack.md sh 블록에 넣을 줄…>
decl() {
  {
    echo '# STACK'
    echo '```sh'
    printf '%s\n' "$@"
    echo '```'
  } > "$R/.claude/stack.md" || { echo "!! stack.md 쓰기 실패"; exit 1; }
}

# check <설명> <기대 rc> <출력에 있어야 할 말|-> <메시지> [GIT_EDITOR]
# 메시지는 printf %b 로 쓴다 (\n · \r 를 넣을 수 있다).
# GIT_EDITOR 를 안 주면 ':' 다 — git commit -m · -F 와 같은 경로다. '-' 면 지운다 (편집기 경로).
check() {
  local label="$1" wrc="$2" yes="$3" msg="$4" ed="${5-:}" out rc
  printf '%b' "$msg" > "$TMP/msg" || { echo "!! 메시지 쓰기 실패"; exit 1; }
  if [ "$ed" = "-" ]; then
    out="$( cd "$R" && env -u GIT_EDITOR bash "$HOOK" "$TMP/msg" 2>&1 )"; rc=$?
  else
    out="$( cd "$R" && GIT_EDITOR="$ed" bash "$HOOK" "$TMP/msg" 2>&1 )"; rc=$?
  fi
  if [ "$rc" -ne "$wrc" ]; then
    FAIL=$((FAIL + 1)); printf '  x %s — rc=%s (기대 %s)\n' "$label" "$rc" "$wrc"
    printf '%s\n' "$out" | sed 's/^/      /'; return
  fi
  if [ "$yes" != "-" ]; then
    case "$out" in
      *"$yes"*) ;;
      *) FAIL=$((FAIL + 1)); printf "  x %s — 출력에 '%s' 가 없다\n" "$label" "$yes"
         printf '%s\n' "$out" | sed 's/^/      /'; return ;;
    esac
  fi
  PASS=$((PASS + 1))
}

# --- 비운 칸은 아무것도 막지 않는다 -----------------------------------------
decl 'COMMIT_TYPES=""' 'COMMIT_ISSUE_KEY=""'
check "빈 선언 · 타입 없는 제목"     0 - 'Initial commit\n'
check "빈 선언 · 아무 말"            0 - 'harness: 무엇이든\n'
check "빈 선언 · 키 모양이 틀려도"   0 - 'wip [PROJ12]\n'
decl 'COMMIT_TYPES="<채워넣기>"' 'COMMIT_ISSUE_KEY="<채워넣기>"'
check "채워넣기 · 빈 칸으로 본다"    0 - 'Initial commit\n'
rm -f "$R/.claude/stack.md"
check "stack.md 없음"                0 - 'Initial commit\n'

# --- 타입 -------------------------------------------------------------------
decl 'COMMIT_TYPES="feat|fix|docs"'
check "타입"                         0 - 'feat: 로그인 추가\n'
check "범위"                         0 - 'fix(api): 응답 고침\n'
check "범위 · 슬래시 · 점"           0 - 'feat(ui/button.v2): 버튼\n'
check "범위 · 대문자 · 한글"         0 - 'feat(로그인API): 추가\n'
check "호환 깨짐 표시 !"             0 - 'feat(api)!: 응답 모양 바꿈\n'
check "끝 마침표는 안 본다"          0 - 'feat: 로그인 추가.\n'
# UTF-8 로캘에서 돌려야 의미가 있다. C 로캘이면 grep 이 원래 바이트로 봐서 헛돈다.
# C.UTF-8 이 없는 곳(macOS 등)에서 그 이름을 주면 말없이 C 로 떨어져 헛돈다. 있는 것을 골라 쓴다.
utf8="$(locale -a 2>/dev/null | grep -iE '^(c|en_us)\.utf-?8$' | head -n 1)"
if [ -n "$utf8" ]; then
  old_lc="${LC_ALL-}"; export LC_ALL="$utf8"
  check "UTF-8 이 아닌 바이트(CP949)"  0 - 'feat: \xb7\xce\xb1\xd7\xc0\xce\n'
  if [ -n "$old_lc" ]; then export LC_ALL="$old_lc"; else unset LC_ALL; fi
else
  echo "  - UTF-8 로캘이 없어 CP949 바이트 사례를 건너뛰었다"
fi
check "길이는 안 본다"               0 - 'feat: 아주 긴 제목이라도 팀이 정하지 않았으면 막지도 경고하지도 않는다 정말로\n'
check "목록에 없는 타입"             1 "타입이 목록에 없다" 'chore: 정리\n'
check "대문자 타입"                  1 "타입이 목록에 없다" 'Feat: 로그인\n'
check "타입으로 시작하는 다른 말"    1 "타입이 목록에 없다" 'fixes: 고침\n'
check "타입 없는 제목"               1 "타입이 목록에 없다" 'Initial commit\n'
check "타입에 밑줄이 붙은 말"        1 "타입이 목록에 없다" 'feat_x: 로그인\n'
check "콜론 뒤 공백 없음"            1 "모양이 틀렸다" 'feat:로그인\n'
check "콜론 뒤 공백 둘"              1 "모양이 틀렸다" 'feat:  로그인\n'
check "타입 뒤 공백"                 1 "모양이 틀렸다" 'feat : 로그인\n'
check "빈 범위"                      1 "모양이 틀렸다" 'feat(): 로그인\n'
check "범위 안 공백"                 1 "모양이 틀렸다" 'feat(a b): 로그인\n'
decl 'COMMIT_TYPES="Feat|Fix"'
check "대문자 타입도 선언한 대로"    0 - 'Feat: 로그인\n'
check "선언과 대소문자가 다르면"     1 "타입이 목록에 없다" 'feat: 로그인\n'

# --- 제목 줄 고르기 — git 이 저장할 첫 줄과 같아야 한다 --------------------
decl 'COMMIT_TYPES="feat|fix|docs"'
check "-m · # 로 시작해도 제목"      1 "타입이 목록에 없다" '#12 버그 고침\n'
check "편집기 · 주석 줄은 건너뛴다"  0 - '# 안내\nfeat: 로그인\n# 안내\n' -
check "편집기 · ##### 안내 줄"       0 - '##### 제목은 짧게 #####\nfeat: 로그인\n' -
check "편집기 · 가운데 # 은 그대로"  0 - 'fix: #12 고침\n' -
check "편집기 · 첫 줄이 비었다"      1 "타입이 목록에 없다" '\n\nadded login\n' -
check "GIT_EDITOR 가 편집기 이름"    0 - '# 안내\nfeat: 로그인\n' vim
check "CRLF 메시지"                  0 - 'feat: 로그인\r\n\r\n본문\r\n'
# Git Bash 의 awk 는 스스로 CR 을 떼서 Windows 에서는 헛돈다. Linux CI 에서 의미가 있다.
check "편집기 · CRLF 첫 줄 빈 줄"    0 - '\r\nfeat: 로그인\r\n' -
git -C "$R" config core.commentChar ';' || exit 1
check "주석 문자 ;"                  0 - '; 안내\nfeat: 로그인\n' -
git -C "$R" config core.commentChar '#' || exit 1
git -C "$R" config core.commentString ';' || exit 1
check "나중에 적힌 commentString"    0 - '; 안내\nfeat: 로그인\n' -
git -C "$R" config --unset core.commentString || exit 1
printf '# STACK\r\n```sh\r\nCOMMIT_TYPES="feat|fix"\r\n```\r\n' > "$R/.claude/stack.md" || exit 1
check "CRLF stack.md · 규칙이 살아 있다" 1 "타입이 목록에 없다" 'Initial commit\n'

# --- git 이 만든 제목 -------------------------------------------------------
decl 'COMMIT_TYPES="feat|fix"'
check "Revert"                       0 - 'Revert "feat: 로그인"\n'
check "Reapply"                      0 - 'Reapply "feat: 로그인"\n'
check "fixup!"                       0 - 'fixup! feat: 로그인\n'
check "squash!"                      0 - 'squash! feat: 로그인\n'
check "amend!"                       0 - 'amend! feat: 로그인\n'
# MR 검사(mr-check.sh)가 부를 때는 막는다. 합치지 않은 채 들어가면 고침 커밋이 이력에 남는다
export MR_CHECK=1
check "MR 검사 · fixup!"             1 "합치지 않은 고침 커밋" 'fixup! feat: 로그인\n'
check "MR 검사 · squash!"            1 "합치지 않은 고침 커밋" 'squash! feat: 로그인\n'
check "MR 검사 · amend!"             1 "합치지 않은 고침 커밋" 'amend! feat: 로그인\n'
check "MR 검사 · Revert 는 그대로"   0 - 'Revert "feat: 로그인"\n'
unset MR_CHECK
check "사람이 쓴 Merge"              1 "타입이 목록에 없다" 'Merge 로그인 기능\n'
check "사람이 쓴 Revert"             1 "타입이 목록에 없다" 'Revert 로그인 롤백\n'
git -C "$R" -c user.name=t -c user.email=t@t -c commit.gpgsign=false \
  commit -q --allow-empty --no-verify -m base \
  || { echo "!! 기준 커밋 실패"; exit 1; }
git -C "$R" rev-parse HEAD > "$R/.git/MERGE_HEAD" || exit 1
check "병합 중인 Merge"              0 - "Merge branch 'side'\n"
rm -f "$R/.git/MERGE_HEAD"

# --- 이슈키 -----------------------------------------------------------------
decl 'COMMIT_ISSUE_KEY="PROJ"'
check "키가 없어도 된다"             0 - 'feat: 로그인\n'
check "키만 선언하면 타입은 안 본다" 0 - 'Initial commit\n'
check "키 · 끝"                      0 - 'feat: 로그인 [PROJ-12]\n'
check "키 · 가운데"                  0 - 'feat: [PROJ-12] 로그인\n'
check "키 둘"                        0 - 'feat: 로그인 [PROJ-12] [PROJ-13]\n'
check "다른 대괄호 · arr[0]"         0 - 'fix: arr[0] 오류\n'
check "다른 대괄호 · [WIP]"          0 - 'feat: [WIP] 로그인\n'
check "키로 시작하는 다른 말"        0 - 'docs: [PROJECT-1] 정리\n'
check "키 · 하이픈 없음"             1 "이슈키 모양이 틀렸다" 'feat: 로그인 [PROJ12]\n'
check "키 · 소문자"                  1 "이슈키 모양이 틀렸다" 'feat: 로그인 [proj-12]\n'
check "키 · 번호 없음"               1 "이슈키 모양이 틀렸다" 'feat: 로그인 [PROJ-]\n'
check "키 · 공백"                    1 "이슈키 모양이 틀렸다" 'feat: 로그인 [PROJ 12]\n'
check "키 · 괄호를 안 닫음"          1 "이슈키 모양이 틀렸다" 'feat: 로그인 [PROJ-12\n'
check "키 · 번호 뒤 글자"            1 "이슈키 모양이 틀렸다" 'feat: 로그인 [PROJ-12a]\n'
check "키 · 번호를 뺀 태그"          1 "이슈키 모양이 틀렸다" 'feat: 로그인 [PROJ]\n'

# --- 선언을 잘못 적으면 설정 탓이라고 멈춘다 --------------------------------
decl 'COMMIT_TYPES="feat fix"'
check "타입을 공백으로 구분"         1 "형식에 안 맞는다: COMMIT_TYPES" 'feat: 로그인\n'
decl 'COMMIT_TYPES="feat|fix|"'
check "타입 끝에 |"                  1 "형식에 안 맞는다: COMMIT_TYPES" 'feat: 로그인\n'
decl 'COMMIT_TYPES=feat|fix'
check "따옴표 없는 선언"             1 "큰따옴표" 'feat: 로그인\n'
decl '  COMMIT_TYPES="feat|fix"'
check "들여 쓴 선언"                 1 "큰따옴표" 'Initial commit\n'
decl 'export COMMIT_TYPES="feat|fix"'
check "export 붙인 선언"             1 "큰따옴표" 'Initial commit\n'
decl 'COMMIT_ISSUE_KEY="PROJ-"'
check "키에 하이픈"                  1 "형식에 안 맞는다: COMMIT_ISSUE_KEY" 'feat: 로그인\n'
decl 'COMMIT_ISSUE_KEY="proj"'
check "키가 소문자"                  1 "형식에 안 맞는다: COMMIT_ISSUE_KEY" 'feat: 로그인\n'
decl 'COMMIT_ISSUE_KEY="해당 없음 — 이슈 추적기 없음"'
check "키에 「해당 없음」"           1 "형식에 안 맞는다: COMMIT_ISSUE_KEY" 'feat: 로그인\n'

echo "-- 통과 $PASS · 실패 $FAIL ----------------------"
[ "$FAIL" -eq 0 ] || exit 1
