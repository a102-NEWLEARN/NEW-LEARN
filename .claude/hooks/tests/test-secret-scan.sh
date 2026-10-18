#!/usr/bin/env bash
#
# secret-scan.sh 회귀 테스트. 탐지 규칙이 살아 있는지 사람 눈 대신 확인한다.
# 임시 git 저장소에서만 돌고 이 저장소 파일은 건드리지 않는다.
#
#   bash .claude/hooks/tests/test-secret-scan.sh
#
# 🔴 rc 와 출력 문자열을 같이 본다. 경고는 rc=0 이라서 rc 만 보면
# 경고 규칙이나 자리표시자 필터를 통째로 지워도 통과한다.
#
# alpine 에서도 돌려 본다. busybox 의 grep · xargs 는 GNU 와 다르게 동작해서 로컬 초록은
# CI 에 대한 근거가 못 된다 (busybox grep 은 -I 를 받고도 무시한다).
# Windows 는 프로세스 생성이 느려서 docker 쪽이 훨씬 빠르기도 하다.
#
#   docker run --rm -v "$PWD:/w:ro" -w /w alpine:3.24 sh -c \
#     'apk add --no-cache bash git >/dev/null && bash .claude/hooks/tests/test-secret-scan.sh'

set -uo pipefail
# 개발 PC 의 전역 · 시스템 git 설정이 결과를 흔들지 않게 끊는다. 전역으로 core.quotePath=false 를
# 켜 둔 PC 에서는 한글 경로 사례가 고치기 전 스캐너로도 초록이 된다.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

SCAN="$(cd "$(dirname "$0")/.." && pwd)/secret-scan.sh"
[ -f "$SCAN" ] || { echo "!! secret-scan.sh 를 못 찾았다: $SCAN"; exit 1; }

TMP="$(mktemp -d)" || exit 1
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
OUT=""
RC=0

bad() { FAIL=$((FAIL + 1)); printf '  x %s\n' "$1"; printf '%s\n' "$OUT" | sed 's/^/      /'; }

# 🔴 준비가 실패하면 그 자리에서 exit 한다. 넘어가면 빈 저장소를 검사해 거짓 통과하고
# return 1 은 호출한 쪽이 건너뛰기로 삼킬 수 있다.
new_repo() {
  rm -rf "$TMP/r" || { echo "!! rm 실패"; exit 1; }
  mkdir -p "$TMP/r" || { echo "!! mkdir 실패"; exit 1; }
  ( cd "$TMP/r" && git init -q . ) || { echo "!! git init 실패"; exit 1; }
}

# put <파일이름> <내용> [<파일이름2> <내용2> ...] — 작업 트리에 쓴다
put() {
  while [ "$#" -ge 2 ]; do
    mkdir -p "$TMP/r/$(dirname "$1")" || exit 1
    printf '%s\n' "$2" > "$TMP/r/$1" || { echo "!! 쓰기 실패: $1"; exit 1; }
    shift 2
  done
}

# 전역 gitignore 가 .env · *.pem 을 빼면 스캐너가 볼 파일이 사라져서 -f 로 넣는다
stage() { ( cd "$TMP/r" && git add -A -f ) || { echo "!! git add 실패"; exit 1; }; }

# run_scan <파일이름> <내용> ... — 전부 스테이지하고 --all 로 검사한다
run_scan() {
  new_repo; put "$@"; stage
  OUT="$( cd "$TMP/r" && bash "$SCAN" --all 2>&1 )"
  RC=$?
  return 0
}

# run_staged <파일이름> <스테이지할 내용> <그 뒤 작업 트리에 남길 내용>
# 커밋 훅 모드(--all 없이)를 본다. 스테이지와 작업 트리를 일부러 다르게 둔다.
run_staged() {
  new_repo; put "$1" "$2"; stage; put "$1" "$3"
  OUT="$( cd "$TMP/r" && bash "$SCAN" 2>&1 )"
  RC=$?
  return 0
}

# expect <설명> <기대 rc> <출력에 있어야 할 말|-> <출력에 없어야 할 말|-> — 마지막 실행 결과를 본다.
# 기대 rc 는 1 이 차단, 0 이 통과다. 경고는 통과로 친다.
# '|' 로 여러 개를 적을 수 있다. 있어야 할 말은 전부 있어야 하고 없어야 할 말은 하나도 없어야 한다.
expect() {
  local label="$1" wrc="$2" yes="$3" no="$4"
  if [ "$RC" -ne "$wrc" ]; then bad "$label — rc=$RC (기대 $wrc)"; return; fi
  # 🔴 출력 검사에 파이프를 쓰지 않는다. grep -q 가 먼저 끝나면 printf 가 SIGPIPE 로 죽고
  # pipefail 이 그 141 을 결과로 삼는다. 출력이 길면 검사가 거짓으로 통과하거나 실패한다.
  # case 에는 그 함정이 없다. "$y" 는 인용해 둬서 glob 으로 읽히지 않는다.
  local y n=0
  if [ "$yes" != "-" ]; then
    # read 로 쪼갠다. for y in $yes 는 glob 까지 확장해서 *.md 같은 값이 파일 이름에 맞아 버린다.
    while IFS= read -r y; do
      [ -n "$y" ] || continue
      n=$((n + 1))
      case "$OUT" in
        *"$y"*) ;;
        *) bad "$label — 출력에 '$y' 가 없다"; return ;;
      esac
    done <<< "$(printf '%s' "$yes" | tr '|' '\n')"
    [ "$n" -gt 0 ] || { bad "$label — 요구 문자열이 비어 있다 (검사를 안 하려면 '-')"; return; }
  fi
  if [ "$no" != "-" ]; then
    while IFS= read -r y; do
      [ -n "$y" ] || continue
      case "$OUT" in
        *"$y"*) bad "$label — 출력에 '$y' 가 있으면 안 된다"; return ;;
      esac
    done <<< "$(printf '%s' "$no" | tr '|' '\n')"
  fi
  PASS=$((PASS + 1))
}

# want <설명> <기대 rc> <있어야 할 말|-> <없어야 할 말|-> <파일> <내용> ...
want() {
  local label="$1" wrc="$2" yes="$3" no="$4"; shift 4
  run_scan "$@" || { bad "$label — 준비 실패"; return; }
  expect "$label" "$wrc" "$yes" "$no"
}

echo "-- secret-scan 회귀 --------------------------"

# --- HARD: 차단하고 그 규칙 이름을 찍어야 한다 ------------------------------
# Anthropic 키는 OpenAI 패턴에도 걸린다. 이름을 안 보면 Anthropic 규칙을 지워도 통과한다.
want "개인키"         1 "개인키"         - a.txt '-----BEGIN RSA PRIVATE KEY-----'  # secret-scan:allow
want "AWS 액세스 키"  1 "AWS 액세스 키"  - a.txt 'k = "AKIAIOSFODNN7EXAMPLE"'  # secret-scan:allow
want "Google API 키"  1 "Google API 키"  - a.txt 'k=AIzaSyA1234567890abcdefghijklmnopqrstuv'  # secret-scan:allow
want "OpenAI 키"      1 "OpenAI 키"      - a.txt 'k=sk-abcdefghij0123456789XY'  # secret-scan:allow
want "GitHub 토큰"    1 "GitHub 토큰"    - a.txt 'k=ghp_abcdefghij0123456789abcdefghij01'  # secret-scan:allow
want "Slack 토큰"     1 "Slack 토큰"     - a.txt 'k=xoxb-abcdefghij-0123456789'  # secret-scan:allow
want "GitLab 토큰"    1 "GitLab 토큰"    - a.txt 'k=glpat-abcdefghij0123456789XY'  # secret-scan:allow
want "Anthropic 키"   1 "Anthropic 키"   - a.txt 'k=sk-ant-abcdefghij0123456789XY'  # secret-scan:allow
want "웹훅 URL"       1 "웹훅 URL (Mattermost)" - a.txt 'u=https://x.example/hooks/abcdefghij0123456'  # secret-scan:allow
want "URL 자격"       1 "URL 에 박힌"    - a.txt 'u=https://user:supersecret1@db.example/x'  # secret-scan:allow

# 형식마다 따로 저장소를 만들면 느려서 한 번에 돌린다. 규칙 이름과 파일을 짝으로 본다.
# 값은 따옴표로 쪼개 적는다. 호스팅의 push 보호가 이 파일을 키로 보고 막을 수 있다.
run_scan \
  pgp.txt     '-----BEGIN PGP PRIVATE'' KEY BLOCK-----' \
  ghr.txt     'k=ghr''_abcdefghij0123456789abcdefghij012345' \
  gloas.txt   'k=gloas''-abcdefghij0123456789XY' \
  xoxe.txt    'k=xoxe''-1-abcdefghij0123' \
  xapp.txt    'k=xapp''-1-A0123456789-abcdef' \
  stripe.txt  'k=sk_live''_0123456789abcdefghijABCD' \
  rk.txt      'k=rk_live''_0123456789abcdefghijABCD' \
  npm.txt     'k=npm''_abcdefghij0123456789abcdefghij012345' \
  pypi.txt    'k=pypi''-AgEIcHlwaS5vcmcabcdefghij0123456789abcdefghij0123456789abcdefghij0123456789abcdefghij0123456789' \
  pypi2.txt   'k=pypi''-AgENabcdefghij0123456789abcdefghij0123456789abcdefghij0123456789abcdefghij0123456789abcdefghij' \
  hf.txt      'k=hf''_abcdefghijklmnopqrstuvwxyzABCDEFGH' \
  slack.txt   'u=https://hooks.slack''.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX' \
  discord.txt 'u=https://discord''.com/api/webhooks/123456789012345678/abcdefghij0123456789abcdefghij'
# pypi2 는 머리 글자가 다르다. PyPI 공식 형식(pypi- 뒤 85자 이상)은 머리 글자를 정하지 않는다.
expect "새 형식 전부" 1 "개인키 — pgp.txt:1|GitHub 토큰 — ghr.txt:1|GitLab 토큰 — gloas.txt:1|Slack 토큰 — xapp.txt:1 xoxe.txt:1|Stripe 비밀 키 — rk.txt:1 stripe.txt:1|패키지 레지스트리 토큰 (npm·PyPI) — npm.txt:1 pypi.txt:1 pypi2.txt:1|Hugging Face 토큰 — hf.txt:1|웹훅 URL (Slack·Discord) — discord.txt:1 slack.txt:1" -

# 왼쪽 경계가 없으면 낱말 속에 키 접두가 든 이름이 키로 막힌다. task- · mask- · risk- 의 sk- 는 OpenAI,
# taxapp- · wxapp- 의 xapp- 는 Slack, network_live_ 의 rk_live_ 는 Stripe 로 읽힌다.
want "케밥 이름"      0 - "OpenAI|Slack|Stripe" a.txt \
  'cls="mask-image-linear-from-color task-management-dashboard-v2 risk-assessment-summary-card"'$'\n''"name": "taxapp-backend-service", cd wxapp-mini-program-demo'$'\n''const network_live_streamingConfiguration = 1;'

# --- 파일 이름만으로 차단 ----------------------------------------------------
want ".env 파일"      1 "커밋하면 안 되는" - .env       'X=1'
want "pem 파일"       1 "커밋하면 안 되는" - server.pem 'x'
want "이름.env"       1 "커밋하면 안 되는" - deploy.env 'X=1'
# 대소문자를 가리면 빠진다. Windows · macOS 파일 시스템에서는 같은 파일이다
want "대문자 .ENV"    1 "커밋하면 안 되는 파일: .ENV" - .ENV 'X=1'
want "대문자 x.PEM"   1 "커밋하면 안 되는 파일: x.PEM" - x.PEM 'x'
want "대문자 .EXAMPLE 은 면제" 0 - "커밋하면" .env.EXAMPLE 'X='

# --- 한글 경로: git 이 감싸 내놓으면 이름 규칙도 내용 검사도 빗나간다 ---------
want "한글 경로 내용" 1 "AWS 액세스 키 — 설정/키.txt:1" - '설정/키.txt' 'k = "AKIAIOSFODNN7EXAMPLE"'  # secret-scan:allow
want "한글.env"       1 "커밋하면 안 되는 파일: 로컬.env" - '로컬.env' 'X=1'

# --- SOFT: 통과하되 경고가 실제로 찍혀야 한다 -------------------------------
want "SOFT 경고"      0 "비밀값처럼"     - a.txt 'password = "hunter2hunter2"'  # secret-scan:allow
want "JWT 경고"       0 "JWT"            - a.txt 't=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.'  # secret-scan:allow
want "env 형식 경고"  0 "env 형식"       - a.txt 'DB_PASSWORD=hunter2hunter2'  # secret-scan:allow
want "DB 접속 경고"   0 "DB 접속 문자열" - a.txt 'u=postgresql://appuser:s3cr3tPassw0rd@db.internal:5432/app'  # secret-scan:allow

# --- 통과해야 하는 것 --------------------------------------------------------
want "평범한 파일"    0 -                "비밀값처럼" a.txt 'hello world'
want "자리표시자"     0 -                "비밀값처럼" a.txt 'password = "<your-password>"'  # secret-scan:allow
want "자리표시자 xxx" 0 -                "비밀값처럼" a.txt 'password = "xxxxxxxx"'  # secret-scan:allow
want "자리표시자 your-" 0 -              "비밀값처럼" a.txt 'password = "your-password-here"'  # secret-scan:allow
# 경계가 없으면 값 속의 xxx 한 토막이 경고를 지운다.
want "값 속의 xxx"    0 "비밀값처럼"     - a.txt 'password = "abcxxxdefghi"'  # secret-scan:allow
# 말줄임은 값 끝 · 따옴표 옆만 자리표시자다. 아무 데나 받으면 전개 문법이 든 줄이 통째로 빠진다
want "말줄임 자리표시자" 0 -             "비밀값처럼" a.txt 'password = "abcd1234..."'  # secret-scan:allow
want "전개 문법 뒤의 값" 0 "비밀값처럼"  - a.js 'const c = {...base, password: "hunter2hunter2"}'  # secret-scan:allow
want "allow 주석"     0 -                "AWS"        a.txt 'k = "AKIAIOSFODNN7EXAMPLE"  # secret-scan:allow'
want "example 이름"   0 -                "커밋하면"   .env.example 'DB_PASSWORD='
want "DB 자리표시자"  0 -                "DB 접속"    a.txt 'u=postgresql://appuser:<password>@db.example.com/app'
want "DB localhost"   0 -                "DB 접속"    a.txt 'u=postgres://postgres:postgres@localhost:5432/app'

# 이름이 example 이어도 내용 검사는 돈다.
want "example 에 키"  1 "AWS 액세스 키"  - .env.example 'K=AKIAIOSFODNN7EXAMPLE'  # secret-scan:allow

# --- 경로가 면제 판정에 섞이지 않는다 ---------------------------------------
# 면제 필터가 경로까지 보면 이 파일들이 통째로 빠진다. 이름이 전부 PLACEHOLDER 낱말이다.
want "경로 dummy"       0 "dummy.txt"       - dummy.txt       'password = "hunter2hunter2"'  # secret-scan:allow
want "경로 placeholder" 1 "AWS 액세스 키"   - placeholder.txt 'k = "AKIAIOSFODNN7EXAMPLE"'  # secret-scan:allow
want "경로 xxx"         1 "AWS 액세스 키"   - xxx.txt         'k = "AKIAIOSFODNN7EXAMPLE"'  # secret-scan:allow
want "경로 changeme"    1 "AWS 액세스 키"   - changeme/a.txt  'k = "AKIAIOSFODNN7EXAMPLE"'  # secret-scan:allow

# --- 여러 파일이 한 번에 걸릴 때 둘 다 보고된다 ------------------------------
want "여러 파일" 0 "dummy.txt|normal.txt" - \
  dummy.txt  'password = "hunter2hunter2"' \
  normal.txt 'password = "hunter2hunter2"'  # secret-scan:allow

# --- 커밋 훅 모드는 작업 트리가 아니라 스테이지된 내용을 본다 -----------------
run_staged cfg.txt 'k = "AKIAIOSFODNN7EXAMPLE"' 'k = "removed"'  # secret-scan:allow
expect "스테이지에만 키" 1 "AWS 액세스 키 — cfg.txt:1" -
run_staged cfg.txt 'k = "removed"' 'k = "AKIAIOSFODNN7EXAMPLE"'  # secret-scan:allow
expect "작업 트리에만 키" 0 - "AWS"
run_staged '로컬.env' 'X=1' 'X=1'
expect "스테이지 한글.env" 1 "커밋하면 안 되는 파일: 로컬.env" -

# --- 규칙 파일의 보이지 않는 문자 -------------------------------------------
# 이 파일에 그 문자를 그대로 두면 이 파일이 걸린다. 8진수로 적어 실행 때 만든다.
RLO="$(printf '\342\200\256')"; TAG="$(printf '\363\240\201\201')"; ZWJ="$(printf '\342\200\215')"
BOM="$(printf '\357\273\277')"
CODER="$(printf '\360\237\221\250')${ZWJ}$(printf '\360\237\222\273')"                   # 👨 + ZWJ + 💻
FLAG="$(printf '\360\237\217\263\357\270\217')${ZWJ}$(printf '\360\237\214\210')"       # 🏳️ + ZWJ + 🌈
run_scan \
  .claude/rlo.md "ok"$'\n'"see ${RLO}hidden" \
  .claude/skills/x/SKILL.md "tag ${TAG} here" \
  CLAUDE.md "lone a${ZWJ}b"
expect "숨은 문자 차단" 1 "보이지 않는 문자|.claude/rlo.md:2|.claude/skills/x/SKILL.md:1|CLAUDE.md:1" -
run_scan \
  CLAUDE.md "${BOM}# 규칙"$'\n'"${CODER} ${FLAG} 🔴 ⚠️" \
  docs/notes.md "not a rule file ${RLO}"
expect "이모지 ZWJ · 첫머리 BOM · 규칙 밖 파일" 0 - "보이지 않는 문자"
# 더한 숨은 문자 — 소프트 하이픈 · 한글 채움 문자 넷 · 줄 · 문단 구분 · 이체자 선택자(앞 끝 · 뒤 끝).
# 파일 하나에 하나씩 넣고 건수로 본다. 하나라도 빠지면 건수가 준다
args=()
i=0
for b in '\302\255' '\341\205\237' '\341\205\240' '\343\205\244' '\357\276\240' \
         '\342\200\250' '\342\200\251' '\363\240\204\200' '\363\240\207\257'; do
  i=$((i + 1))
  # shellcheck disable=SC2059  # 8진수 이스케이프를 바이트로 풀려고 형식 자리에 둔다
  args+=(".claude/h$i.md" "a$(printf "$b")b")
done
run_scan "${args[@]}"
expect "더한 숨은 문자 9종 차단" 1 "보이지 않는 문자|(9건)" -
run_staged .claude/a.md "see ${RLO}hidden" "clean"
expect "스테이지에만 숨은 문자" 1 "보이지 않는 문자 — .claude/a.md:1" -
# color.ui=always 면 git grep 이 파이프에도 색 코드를 붙인다. 그 출력을 못 읽으면 검사 없이 초록이 된다.
new_repo
( cd "$TMP/r" && git config color.ui always ) || { echo "!! git config 실패"; exit 1; }
put CLAUDE.md "see ${RLO}hidden"; stage
OUT="$( cd "$TMP/r" && bash "$SCAN" --all 2>&1 )"; RC=$?
expect "color.ui=always 에서도 숨은 문자" 1 "보이지 않는 문자 — CLAUDE.md:1" -
# grep.column=true 면 열 번호가 끼어 install.ps1 의 1행 BOM 이 막힌다 (까닭은 secret-scan.sh 3절 주석).
new_repo
( cd "$TMP/r" && git config grep.column true ) || { echo "!! git config 실패"; exit 1; }
put .claude/hooks/install.ps1 "${BOM}# 설치"$'\n'"Write-Host ok" CLAUDE.md "ok"$'\n'"see ${RLO}hidden"; stage
OUT="$( cd "$TMP/r" && bash "$SCAN" --all 2>&1 )"; RC=$?
expect "grep.column=true 에서도 첫머리 BOM 통과 · 숨은 문자 차단" 1 "보이지 않는 문자 — CLAUDE.md:2" "install.ps1"
run_scan CLAUDE.md "see ${TAG}hidden <!-- secret-scan:allow -->"
expect "allow 주석이 붙은 숨은 문자도 차단" 1 "보이지 않는 문자 — CLAUDE.md:1" -
# 같은 저장소를 여는 다른 도구의 규칙 파일. 「규칙 파일 백도어」 공격이 노린 자리다
run_scan \
  AGENTS.md "see ${RLO}hidden" \
  GEMINI.md "see ${RLO}hidden" \
  .cursor/rules/a.mdc "see ${RLO}hidden" \
  .github/copilot-instructions.md "see ${RLO}hidden"
# 위치는 세 건까지만 찍는다. 넷째(GEMINI.md)는 건수로 본다
expect "다른 도구의 규칙 파일도 숨은 문자 차단" 1 ".cursor/rules/a.mdc:1|.github/copilot-instructions.md:1|AGENTS.md:1|(4건)" -
run_scan .github/workflows/x.yml "see ${RLO}hidden"
expect "규칙 파일이 아닌 .github 는 안 본다" 0 - "보이지 않는 문자"

# --- grep 이 오류로 끝나면 통과시키지 않는다 ---------------------------------
# 고치기 전 스캐너는 오류를 버려서 못 읽은 파일 · 깨진 정규식이 「찾은 것 없음」이 됐다.
# 내용 검사(-IHnE)만 실패하는 가짜 grep 을 PATH 앞에 둔다.
REAL_GREP="$(command -v grep)"
SHIM="$TMP/shim"
mkdir -p "$SHIM" || exit 1
printf '#!/bin/sh\ncase " $* " in *" -IHnE "*) echo "grep: simulated failure" >&2; exit 2 ;; esac\nexec "%s" "$@"\n' \
  "$REAL_GREP" > "$SHIM/grep" && chmod +x "$SHIM/grep" || { echo "!! 가짜 grep 준비 실패"; exit 1; }
new_repo; put a.txt 'hello'; stage
OUT="$( cd "$TMP/r" && PATH="$SHIM:$PATH" bash "$SCAN" --all 2>&1 )"; RC=$?
expect "grep 오류 · 막는다" 1 "내용 검사를 못 돌렸다" -

# --- --range: PR 의 커밋 이력 ------------------------------------------------
# --all 은 마지막 트리만 본다. 키를 넣었다가 다음 커밋에서 지운 PR 이 통과했다
g() { ( cd "$TMP/r" && git -c user.name=t -c user.email=t@t -c commit.gpgsign=false "$@" ) || { echo "!! git $* 실패"; exit 1; }; }
new_repo; put a.txt 'hello'; stage; g commit -q --no-verify -m base
BASE="$( cd "$TMP/r" && git rev-parse HEAD )" || exit 1
put cfg.txt 'k = "AKIAIOSFODNN7EXAMPLE"'; stage; g commit -q --no-verify -m add  # secret-scan:allow
put cfg.txt 'k = "removed"'; stage; g commit -q --no-verify -m remove
printf 'X=1\n' > "$TMP/r/deploy.env" && stage && g commit -q --no-verify -m env-add || exit 1
g rm -q deploy.env; g commit -q --no-verify -m env-remove
OUT="$( cd "$TMP/r" && bash "$SCAN" --all 2>&1 )"; RC=$?
expect "--all 은 마지막 트리만 본다" 0 - "AWS|deploy.env"
OUT="$( cd "$TMP/r" && bash "$SCAN" --range "$BASE" 2>&1 )"; RC=$?
expect "--range · 지운 키도 이력에서 잡는다" 1 "AWS 액세스 키 — 커밋|cfg.txt" -
expect "--range · 지운 비밀 파일도 이름으로 잡는다" 1 "이력에 커밋하면 안 되는 파일: deploy.env" -
# 면제 주석 · 예제 이름은 이력에서도 그대로 통한다
new_repo; put a.txt 'hello'; stage; g commit -q --no-verify -m base
BASE="$( cd "$TMP/r" && git rev-parse HEAD )" || exit 1
put cfg.txt 'k = "AKIAIOSFODNN7EXAMPLE"  # secret-scan:allow' .env.example 'X='; stage; g commit -q --no-verify -m ok
OUT="$( cd "$TMP/r" && bash "$SCAN" --range "$BASE" 2>&1 )"; RC=$?
expect "--range · allow 주석 · 예제 이름" 0 - "AWS|커밋하면"
OUT="$( cd "$TMP/r" && bash "$SCAN" --range HEAD 2>&1 )"; RC=$?
expect "--range · 쌓인 커밋이 없으면 통과" 0 - "🔴"
# 기준을 못 찾으면(얕은 체크아웃) 검사 없이 통과시키지 않는다
OUT="$( cd "$TMP/r" && bash "$SCAN" --range 0000000000000000000000000000000000000000 2>&1 )"; RC=$?
expect "--range · 기준을 못 찾으면 멈춘다" 1 "fetch-depth: 0" -
OUT="$( cd "$TMP/r" && bash "$SCAN" --range 2>&1 )"; RC=$?
expect "--range · 기준을 안 주면 멈춘다" 1 "기준 커밋" -
OUT="$( cd "$TMP" && GIT_DIR="$TMP/nowhere" bash "$SCAN" --range HEAD 2>&1 )"; RC=$?
expect "저장소 밖 --range" 1 "시크릿 스캔을 못 돌렸다" -
# 머지 커밋에서 충돌을 풀며 넣은 키. git log 는 기본으로 머지의 diff 를 안 보여 줘서 고치기 전 스캐너는 놓쳤다.
# 다음 커밋에서 지워 마지막 트리에도 없다
new_repo; put f.txt 'base'; stage; g commit -q --no-verify -m base
BASE="$( cd "$TMP/r" && git rev-parse HEAD )" || exit 1
g checkout -q -b side
put f.txt 'side'; stage; g commit -q --no-verify -m side
g checkout -q -
put f.txt 'main'; stage; g commit -q --no-verify -m main
# 충돌로 멈추는 것이 맞다. g 로 부르면 실패를 준비 실패로 보고 끝낸다
( cd "$TMP/r" && git -c user.name=t -c user.email=t@t merge -q side ) >/dev/null 2>&1
put f.txt 'k = "AKIAIOSFODNN7EXAMPLE"'; stage; g commit -q --no-verify -m merge  # secret-scan:allow
put f.txt 'clean'; stage; g commit -q --no-verify -m remove
OUT="$( cd "$TMP/r" && bash "$SCAN" --range "$BASE" 2>&1 )"; RC=$?
expect "--range · 머지에서 넣은 키도 잡는다" 1 "AWS 액세스 키 — 커밋" -
# git 2.36 미만은 remerge 를 몰라서 -m 으로 본다. remerge 를 거절하는 가짜 git 을 PATH 앞에 둔다
GSHIM="$TMP/gshim"
mkdir -p "$GSHIM" || exit 1
printf '#!/bin/sh\ncase " $* " in *" --diff-merges=remerge "*) echo "fatal: unknown value for --diff-merges" >&2; exit 128 ;; esac\nexec "%s" "$@"\n' \
  "$(command -v git)" > "$GSHIM/git" && chmod +x "$GSHIM/git" || { echo "!! 가짜 git 준비 실패"; exit 1; }
OUT="$( cd "$TMP/r" && PATH="$GSHIM:$PATH" bash "$SCAN" --range "$BASE" 2>&1 )"; RC=$?
expect "--range · remerge 를 모르는 git 도 머지의 키를 잡는다" 1 "AWS 액세스 키 — 커밋" -
# 깨끗한 머지는 remerge 에 바뀐 줄이 없다. 오류 없이 통과한다
new_repo; put a.txt 'a'; stage; g commit -q --no-verify -m base
BASE="$( cd "$TMP/r" && git rev-parse HEAD )" || exit 1
g checkout -q -b side; put b.txt 'b'; stage; g commit -q --no-verify -m side
g checkout -q -; put c.txt 'c'; stage; g commit -q --no-verify -m main
g merge -q --no-edit side
OUT="$( cd "$TMP/r" && bash "$SCAN" --range "$BASE" 2>&1 )"; RC=$?
expect "--range · 깨끗한 머지는 통과" 0 - "🔴"

# --- --all 이 저장소를 못 읽으면 멈춘다 -------------------------------------
# CI 의 secrets 잡이 --all 을 직접 부른다. 여기서 조용히 끝나면 검사 0개짜리 초록이다.
OUT="$( cd "$TMP" && GIT_DIR="$TMP/nowhere" bash "$SCAN" --all 2>&1 )"; RC=$?
expect "저장소 밖 --all" 1 "시크릿 스캔을 못 돌렸다" -

# --- 경로에 ':' 이 있으면 멈춰야 한다 ---------------------------------------
# HARD 면제가 경로까지 보는 회귀는 이름에 secret-scan:allow 가 든 파일로만 잡힌다.
# 그 이름에는 ':' 이 들어가서 이 멈춤이 먼저 막는다. 멈춤이 사라지면 구멍이 다시 열린다.
#
# Windows 는 ':' 이 든 이름을 못 만든다. 이 케이스는 CI(Linux)에서 돌 때 의미가 있다.
# 만들어졌는지는 [ -f ] 대신 git 추적 여부로 본다. NTFS 는 a:b.txt 를 대체 데이터 스트림으로
# 받아 성공한 척한다. CI 에서는 건너뛰지 않고 git 실패도 건너뛰기로 삼키지 않는다.
run_scan 'a:b.txt' 'hello'
if tracked="$( cd "$TMP/r" && git ls-files )"; then
  if [[ "$tracked" == *:* ]]; then
    if [ "$RC" -eq 1 ] && [[ "$OUT" == *"':' 이 있다"* ]]; then
      PASS=$((PASS + 1))
    else
      bad "콜론 경로는 멈춘다 — rc=$RC (기대 1)"
    fi
  elif [ "${GITLAB_CI:-}" = true ] || [ "${CI:-}" = true ]; then
    bad "콜론 경로 — CI 인데 ':' 경로가 추적되지 않았다 (건너뛰면 안 되는 자리다)"
  else
    echo "  - 콜론 경로: 이 파일시스템이 ':' 경로를 추적 못 해 건너뜀 (CI 에서는 돈다)"
  fi
else
  bad "콜론 경로 — git ls-files 실패"
fi

# --- git 이 따옴표로 감싸는 경로도 멈춘다 ------------------------------------
# 역슬래시 · 따옴표 · 제어문자가 든 경로는 quotePath 를 꺼도 "…" 로 나와서 [ -f ] 에서 떨어진다.
# 고치기 전 스캐너는 그 파일의 내용 검사를 말없이 건너뛰었다. 위 콜론 사례처럼 Linux 에서만 만들어진다.
run_scan 'a\b.txt' 'k = "AKIAIOSFODNN7EXAMPLE"'  # secret-scan:allow
if tracked="$( cd "$TMP/r" && git -c core.quotePath=false ls-files )"; then
  if [[ "$tracked" == \"* ]]; then
    if [ "$RC" -eq 1 ] && [[ "$OUT" == *"따옴표 · 역슬래시"* ]]; then
      PASS=$((PASS + 1))
    else
      bad "따옴표로 감싼 경로는 멈춘다 — rc=$RC (기대 1)"
    fi
  elif [ "${GITLAB_CI:-}" = true ] || [ "${CI:-}" = true ]; then
    bad "역슬래시 경로 — CI 인데 그 경로가 추적되지 않았다 (건너뛰면 안 되는 자리다)"
  else
    echo "  - 역슬래시 경로: 이 파일시스템이 그 이름을 못 만들어 건너뜀 (CI 에서는 돈다)"
  fi
else
  bad "역슬래시 경로 — git ls-files 실패"
fi

echo "-- 통과 $PASS · 실패 $FAIL ----------------------"
[ "$FAIL" -eq 0 ] || exit 1
