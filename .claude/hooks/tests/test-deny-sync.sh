#!/usr/bin/env bash
#
# 비밀 파일 정의가 두 곳에서 갈라지지 않았는지 본다.
# 커밋하면 안 되는 파일(secret-scan.sh 의 SECRET_FILES)은 Claude 도 읽으면 안 된다(settings.json 의 Read deny).
# JSON 은 다른 파일을 끌어올 수 없어서 목록이 두 벌이다. 「서로 맞출 것」이라는 주석은 언젠가 어긋나서 테스트로 묶는다.
#
#   bash .claude/hooks/tests/test-deny-sync.sh
#
# 보는 것
#   1. SECRET_FILES 의 이름마다 deny 가 막는다. '!' 예외로 다시 열리지도 않는다
#   2. deny 의 '!' 예외는 secret-scan 이 이름으로 면제하는 파일(.example 등)만 연다
#   3. 1 · 2 에서 쓴 이름을 실제 스캐너에 넣어 본다. 목록을 잘못 읽고 초록이 뜨는 것을 막는다
#
# deny 가 더 넓은 것은 괜찮다. 홈 디렉터리 비밀처럼 커밋과 상관없는 규칙도 deny 에 있다.
# deny 매칭은 권한 문서의 규칙을 흉내 낸다. 경로 없는 이름은 어느 깊이에서나 맞고 '**/이름' 과 같다.
# '!' 는 앞에 나온 규칙에서만 빼낸다. Claude Code 를 직접 띄워 본 것은 아니다.

set -uo pipefail
# 개발 PC 의 전역 · 시스템 git 설정이 결과를 흔들지 않게 끊는다 (Windows 는 autocrlf 경고도 잔뜩 섞인다)
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

HOOKS="$(cd "$(dirname "$0")/.." && pwd)"
SCAN="$HOOKS/secret-scan.sh"
SETTINGS="$HOOKS/../settings.json"
[ -f "$SCAN" ] || { echo "!! secret-scan.sh 를 못 찾았다: $SCAN"; exit 1; }
[ -f "$SETTINGS" ] || { echo "!! settings.json 을 못 찾았다: $SETTINGS"; exit 1; }

TMP="$(mktemp -d)" || exit 1
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
bad() { FAIL=$((FAIL + 1)); printf '  x %s\n' "$1"; }

echo "-- deny ↔ secret-scan 대조 ------------------"

# --- 양쪽 목록을 읽는다 -------------------------------------------------------
# 🔴 하나도 못 읽으면 바로 멈춘다. 빈 목록끼리 대조하면 검사한 것 없이 초록이 뜬다.
SECRETS=()
while IFS= read -r g; do
  [ -n "$g" ] && SECRETS+=("$g")
done <<< "$(tr -d '\r' < "$SCAN" | sed -n '/^SECRET_FILES=(/,/^)/p' | sed 's/#.*//' | grep -o "'[^']*'" | tr -d "'")"
[ "${#SECRETS[@]}" -gt 0 ] || { echo "!! secret-scan.sh 에서 SECRET_FILES 를 못 읽었다 — 형식이 바뀌었으면 이 테스트도 고친다"; exit 1; }

SAFE_NAME="$(tr -d '\r' < "$SCAN" | sed -n "s/^SAFE_NAME='\(.*\)'\$/\1/p")"
[ -n "$SAFE_NAME" ] || { echo "!! secret-scan.sh 에서 SAFE_NAME 을 못 읽었다"; exit 1; }

# jq · python 이 없는 이미지에서도 돌게 JSON 을 문자열 · 괄호 토큰으로만 쪼개 permissions.deny 를 찾는다.
# 문자열을 통째로 한 토큰으로 떼므로 훅 명령 안에 든 "deny" 같은 글자에는 걸리지 않는다.
DENY=()
while IFS= read -r r; do
  [ -n "$r" ] && DENY+=("$r")
done <<< "$(tr -d '\r' < "$SETTINGS" \
  | grep -oE '"([^"\\]|\\.)*"|[][{}:]' \
  | awk '
      s == 0 && $0 == "\"deny\"" { s = 1; next }
      s == 1 { s = ($0 == ":") ? 2 : 0; next }
      s == 2 { s = ($0 == "[") ? 3 : 0; next }
      s == 3 { if ($0 == "]") exit; print }' \
  | sed -n 's/^"Read(\(.*\))"$/\1/p')"
[ "${#DENY[@]}" -gt 0 ] || { echo "!! settings.json 의 permissions.deny 에서 Read 규칙을 못 읽었다"; exit 1; }

# denied <이름> — 이름만 보는 deny 규칙을 차례로 대 보고 마지막에 맞은 규칙이 막는 쪽이면 참.
# 경로가 붙은 규칙(~/ · / · ./ · 디렉터리)은 이름만으로 판정할 수 없어서 건너뛴다.
denied() {
  local name="$1" r pat neg hit=1
  for r in "${DENY[@]}"; do
    neg=0; pat="$r"
    case "$pat" in '!'*) neg=1; pat="${pat#!}" ;; esac
    pat="${pat#\*\*/}"
    case "$pat" in */* | '~'*) continue ;; esac
    # shellcheck disable=SC2053  # $pat 을 glob 으로 맞춘다
    if [[ "$name" == $pat ]]; then
      if [ "$neg" -eq 1 ]; then hit=1; else hit=0; fi
    fi
  done
  return "$hit"
}

# --- 0. settings.json 이 JSON 으로 읽히나 --------------------------------------
# 깨지면 Claude Code 가 그 파일의 규칙을 통째로 못 읽는다. 위의 토큰 쪼개기는 쉼표 하나 빠진 것을 못 알아본다.
# 있는 도구로 본다. 하나도 없으면 건너뛴 것을 보이게 찍는다 (검사한 척 초록을 내지 않는다).
# 도구가 실제로 도는지부터 본다 — Windows 의 python3 는 스토어로 보내는 가짜일 수 있다.
JSON_TOOL=""
for t in python3 python node jq; do
  case "$t" in
    node) node -e '' >/dev/null 2>&1 ;;
    jq)   jq -n . >/dev/null 2>&1 ;;
    *)    "$t" -c '' >/dev/null 2>&1 ;;
  esac && { JSON_TOOL="$t"; break; }
done
json_ok() {
  case "$JSON_TOOL" in
    node) node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$SETTINGS" ;;
    jq)   jq empty "$SETTINGS" ;;
    *)    "$JSON_TOOL" -c 'import json, sys; json.load(open(sys.argv[1], encoding="utf-8"))' "$SETTINGS" ;;
  esac
}
if [ -z "$JSON_TOOL" ]; then
  echo "  - settings.json JSON 검사 건너뜀 — python · node · jq 가 없다"
elif json_ok >/dev/null 2>&1; then
  PASS=$((PASS + 1))
else
  bad "settings.json 이 JSON 으로 안 읽힌다 ($JSON_TOOL) — Claude Code 가 이 파일의 규칙을 통째로 못 읽는다"
fi

# --- 1. 커밋 금지 이름마다 deny 가 막는다 -------------------------------------
# glob 의 * 를 글자 하나로 바꾼 이름을 대표로 넣는다.
SAMPLES=()
for g in "${SECRETS[@]}"; do
  s="${g//\*/x}"
  SAMPLES+=("$s")
  if denied "$s"; then
    PASS=$((PASS + 1))
  else
    bad "deny 가 '$g' 를 안 막는다 (예: $s) — settings.json deny 에 \"Read($g)\" 를 더한다"
  fi
done

# --- 2. '!' 예외는 이름 면제 파일만 연다 --------------------------------------
# 예외 패턴의 마지막 glob 글자 뒤 꼬리가 면제 이름으로 끝나야 그 예외에 맞는 이름이 전부 면제 파일이다.
# 꼬리만 보는 까닭: '!*.local' 의 대표 이름 x.local 은 비밀이 아니지만 같은 예외가 .env.local 을 다시 연다.
OPENED=()
for r in "${DENY[@]}"; do
  case "$r" in '!'*) ;; *) continue ;; esac
  pat="${r#!}"
  tail="${pat##*[*?\]]}"
  if printf '%s\n' "$tail" | grep -qiE "$SAFE_NAME"; then
    PASS=$((PASS + 1))
    OPENED+=("${pat//\*/x}")
  else
    bad "deny 예외 '$r' 가 커밋 금지 파일을 다시 열 수 있다 — 예외는 .example 처럼 secret-scan 이 이름으로 면제하는 꼴만 쓴다"
  fi
done

# --- 3. 실제 스캐너에 넣어 본다 ------------------------------------------------
# 하위 폴더에 둬서 '어느 깊이에서나' 도 같이 본다.
R="$TMP/r"
git init -q "$R" || { echo "!! git init 실패"; exit 1; }
mkdir -p "$R/sub" || exit 1
for s in "${SAMPLES[@]}" ${OPENED[@]+"${OPENED[@]}"}; do
  printf 'x\n' > "$R/sub/$s" || { echo "!! 쓰기 실패: sub/$s"; exit 1; }
done
# 전역 gitignore 가 .env · *.pem 을 빼면 스캐너가 볼 파일이 사라져서 -f 로 넣는다
( cd "$R" && git add -A -f ) || { echo "!! git add 실패"; exit 1; }
OUT="$( cd "$R" && bash "$SCAN" --all 2>&1 )"

for s in "${SAMPLES[@]}"; do
  case "$OUT" in
    *"커밋하면 안 되는 파일: sub/$s"*) PASS=$((PASS + 1)) ;;
    *) bad "스캐너가 sub/$s 를 막지 않는다 — SECRET_FILES 를 읽은 결과와 스캐너 동작이 다르다" ;;
  esac
done
for s in ${OPENED[@]+"${OPENED[@]}"}; do
  case "$OUT" in
    *"커밋하면 안 되는 파일: sub/$s"*) bad "deny 예외로 열린 sub/$s 를 스캐너는 커밋 금지로 본다" ;;
    *) PASS=$((PASS + 1)) ;;
  esac
done

echo "-- 통과 $PASS · 실패 $FAIL ----------------------"
[ "$FAIL" -eq 0 ] || exit 1
