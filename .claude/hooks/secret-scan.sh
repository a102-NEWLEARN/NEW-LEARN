#!/usr/bin/env bash
#
# 시크릿 스캔. 커밋에 비밀값이 섞였는지 본다.
#
#   기본             스테이지된 내용만 검사 (pre-commit 훅이 부른다)
#   --all            추적 중인 파일 전부 검사 (CI · /health-check 가 부른다)
#   --range <기준>   기준 뒤로 쌓인 커밋 전부(머지 포함)의 새 파일 이름과 추가된 줄 (CI 가 PR · MR 에서 부른다).
#                    --all 은 마지막 트리만 봐서, 키를 넣었다가 다음 커밋에서 지운 PR 이 통과한다
#
# 새어 나간 키는 지워도 복제본 · 로그 · 캐시에 남는다. 폐기하고 재발급하는 수밖에 없다.
# 알려진 형식만 잡는다. 통과했다고 안전하지 않다.
# 오탐이면 그 줄 끝에 secret-scan:allow 를 적는다 (규칙 파일의 숨은 문자는 면제 안 됨).

set -uo pipefail

MODE=staged
RANGE_BASE=""
case "${1:-}" in
  --all)   MODE=all ;;
  --range) MODE=range; RANGE_BASE="${2:-}" ;;
esac

# 저장소 밖에서 불린 커밋 훅 모드는 조용히 빠진다. --all · --range 는 CI 가 직접 부르므로
# 같이 빠지면 검사 0개짜리 초록이 된다. 그래서 멈춘다.
if ! ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  [ "$MODE" = staged ] && exit 0
  printf '🔴 git 저장소를 못 읽어 시크릿 스캔을 못 돌렸다 — git 이 없거나 safe.directory 에 막혔다\n' >&2
  git rev-parse --show-toplevel >/dev/null   # git 이 직접 대는 까닭을 같이 찍는다
  exit 1
fi
cd "$ROOT" || exit 1

# git 은 기본값으로 한글 같은 비ASCII 경로를 "\354\204…" 로 감싸 내놓는다. 그런 경로는
# 이름 규칙에 안 맞고 [ -f ] 에서도 떨어진다. 그래서 한글 이름 파일이 검사를 통째로 빠져나간다.
git() { command git -c core.quotePath=false "$@"; }

BLOCKED=0
WARNED=0

say()   { printf '%s\n' "$*" >&2; }
block() { printf '  🔴 %s\n     %s\n' "$1" "$2" >&2; BLOCKED=1; }
warn()  { printf '  ⚠️  %s\n     %s\n' "$1" "$2" >&2; WARNED=1; }

TMPD="$(mktemp -d)" || exit 1
trap 'rm -rf "$TMPD"' EXIT

# 끝맺음. 세 모드가 같이 쓴다.
finish() {
  if [ "$BLOCKED" -ne 0 ]; then
    say ""
    say "🔴 시크릿 스캔이 커밋을 막았다."
    say ""
    exit 1
  fi
  [ "$WARNED" -ne 0 ] && say "   (경고만 — 커밋은 진행된다. 진짜 값인지 눈으로 확인할 것)"
  exit 0
}

# ---------------------------------------------------------------------------
# 규칙 — 파일 이름
# ---------------------------------------------------------------------------
# 예제 · 템플릿은 값이 없다는 뜻이라 이름 검사만 면제한다.
# 이름 끝에 앵커를 건다. 없으면 samples/ 같은 폴더 아래의 .env 까지 이름 검사를 빠져나간다.
SAFE_NAME='(^|/)[^/]*\.(example|sample|template|dist)$'

# 커밋하면 안 되는 파일은 Claude 도 읽으면 안 된다. 이 목록은 tests/test-deny-sync.sh 가
# settings.json 의 Read deny 와 대조한다. 그쪽과 같은 글자로 적으려고 경로 없는 glob 으로 둔다.
# .env 계열을 넓게 잡는다. .env.prod 나 deploy.env 도 커밋되면 안 된다.
# Terraform · OpenTofu 상태 파일은 만든 자원의 비밀번호 · 키를 평문으로 담는다 (백업 .tfstate.backup 도).
SECRET_FILES=(
  '.env' '.env.*' '*.env'
  '*.pem' '*.key' '*.p12' '*.pfx' '*.jks' '*.keystore' '*.p8'
  'id_rsa' 'id_dsa' 'id_ecdsa' 'id_ed25519'
  '*serviceAccount*.json' 'credentials.json' 'google-services.json' 'GoogleService-Info.plist'
  '*.tfstate' '*.tfstate.*'
)

# glob 을 정규식 하나로 묶는다. 파일마다 grep 을 부르면 파일 수만큼 프로세스가 뜬다.
# 변환은 . 과 * 만 안다. 다른 glob 글자를 쓰면 정규식으로 그대로 넘어간다.
NEVER_COMMIT=""
for g in "${SECRET_FILES[@]}"; do
  g="${g//./[.]}"
  g="${g//\*/[^/]*}"
  NEVER_COMMIT="${NEVER_COMMIT:+$NEVER_COMMIT|}(^|/)$g\$"
done

# bad_names <목록> — 목록에서 커밋 금지 이름만 남긴다. 대소문자를 가리지 않는다.
# 가리면 .ENV · server.PEM 이 빠진다. 대소문자를 안 가리는 파일 시스템(Windows · macOS)에서는 같은 파일이다.
bad_names() { printf '%s\n' "$1" | grep -viE "$SAFE_NAME" | grep -iE "$NEVER_COMMIT"; }

# ---------------------------------------------------------------------------
# 규칙 — 파일 내용
# ---------------------------------------------------------------------------
# 형식 이름|정규식. 걸린 값은 출력하지 않는다. 찍으면 로그에 또 남는다.
# 저장소가 실제로 쓰는 서비스의 키를 더한다. 빠지면 정작 샐 것을 못 잡는다.
HARD=(
  "개인키|-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----"
  "AWS 액세스 키|(AKIA|ASIA)[0-9A-Z]{16}"
  "Google API 키|AIza[0-9A-Za-z_-]{35}"
  # 왼쪽 경계가 없으면 task-management-… 같은 케밥 이름이 키로 읽혀 커밋이 막힌다.
  "OpenAI 키|(^|[^A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20,}"
  "Anthropic 키|(^|[^A-Za-z0-9_-])sk-ant-[A-Za-z0-9_-]{20,}"
  "GitHub 토큰|(ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}"
  "GitLab 토큰|gl(pat|oas|dt|rt|rtr|cbt|soat|ptt|ft|imt|agent|ffct|wt)-[A-Za-z0-9_-]{20,}"
  # 아래 둘도 왼쪽 경계를 건다. 없으면 taxapp-backend · network_live_… 같은 이름이 키로 읽힌다.
  "Slack 토큰|(^|[^A-Za-z0-9_-])(xox[abeprs]|xapp)-[A-Za-z0-9-]{10,}"
  "Stripe 비밀 키|(^|[^A-Za-z0-9_-])(sk|rk)_live_[A-Za-z0-9]{20,}"
  # PyPI 는 공식 문서(docs.pypi.org/api/secrets)의 형식 그대로다. npm 의 36 · Hugging Face 의 34 는
  # 공식 문서에 없는 길이다. 오른쪽 경계가 없어 더 긴 값은 잡지만 더 짧은 값은 놓친다.
  "패키지 레지스트리 토큰 (npm·PyPI)|npm_[A-Za-z0-9]{36}|pypi-[A-Za-z0-9_-]{85,}"
  "Hugging Face 토큰|(^|[^A-Za-z0-9_])hf_[A-Za-z]{34}"
  "웹훅 URL (Slack·Discord)|hooks\.slack\.com/(services|workflows|triggers)/[A-Za-z0-9+/]{40,}|discord\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]{20,}"
  "웹훅 URL (Mattermost)|https?://[^[:space:]\"']*/hooks/[A-Za-z0-9]{15,}"
  "URL 에 박힌 자격|https?://[^/[:space:]]+:[^@/[:space:]]{8,}@"
)

# 확신할 수 없는 것은 경고만 한다. 오탐으로 막으면 사람들이 훅을 꺼 버린다.
SOFT=(
  "비밀값처럼 보이는 대입|(password|passwd|secret|token|api[_-]?key|private[_-]?key)[\"']?[[:space:]]*[:=][[:space:]]*[\"'][^\"']{8,}[\"']"
  "JWT 로 보이는 문자열|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\."
  # dotenv 는 따옴표를 안 쓴다. 위 규칙은 따옴표를 요구해서 이 모양을 못 잡는다.
  "env 형식 비밀 대입|^[A-Z][A-Z0-9_]*(PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|ACCESS_KEY)=[^[:space:]]{8,}"
  # 차단하지 않는다. 문서 예제와 로컬 개발 값에 같은 모양이 흔하다.
  "DB 접속 문자열의 비밀번호|(postgres(ql)?|mysql|mariadb|mongodb(\+srv)?|rediss?|amqps?)://[^/[:space:]:@]+:[^@/[:space:]]{8,}@"
)

# 자리표시자는 값이 아니라서 경고에서 뺀다.
# 꺾쇠를 < 한 글자로 넓히면 JSX 줄이 전부 면제된다. <이름> 모양으로 좁혀 둔다.
# xxx 와 your- 에는 낱말 경계를 건다. 없으면 진짜 값 속의 xxx 한 토막으로 경고가 빠진다.
# ... 는 값 끝 · 따옴표 옆의 말줄임만 본다. 아무 데나 받으면 {...base, password: "…"} 처럼
# 전개 문법이 든 줄이 통째로 빠진다.
# \b 는 busybox 가 몰라서 글자 묶음으로 적는다.
PLACEHOLDER='<[A-Za-z0-9_ .:-]+>|[^A-Za-z0-9_]x{3,}([^A-Za-z0-9_]|$)|[^A-Za-z0-9_]your[-_ ]|changeme|dummy|placeholder|채워넣기|\.\.\.["'"'"']|["'"'"']\.\.\.|=[^[:space:]]*\.\.\.([[:space:]]|$)|여기에'

# 로컬 개발 DB 의 접속 정보도 경고에서 뺀다. compose 파일의 postgres:postgres@localhost 가
# 커밋마다 경고를 내면 경고를 안 읽게 된다.
LOCAL_HOST='@(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)([:/]|$)'

# 🔴 면제 판정은 내용에만 건다. 경로까지 보면 이름에 dummy 나 secret-scan:allow 가 든
# 파일이 통째로 면제된다. 이 접두사가 파일명:줄번호: 를 먹어서 내용에만 걸리게 한다.
LOC='^[^:]*:[0-9][0-9]*:'

LIST="$TMPD/list"
GREP_ERR="$TMPD/grep.err"
: > "$GREP_ERR"

# grep_all <정규식> — 목록 전체에서 파일:줄:내용 을 뽑고 면제 주석이 달린 줄을 뺀다.
# 목록은 NUL 로 넘긴다. busybox(alpine) xargs 는 -d 를 모르고 -0 만 안다.
# grep 의 오류는 버리지 않고 모은다. 버리면 못 읽은 파일 · 깨진 정규식이 「찾은 것 없음」으로 보인다.
# xargs 의 종료 코드는 「못 찾음」과 「오류」를 가르지 못해서 오류 출력으로 판정한다 (grep_failed).
grep_all() {
  tr '\n' '\0' < "$LIST" \
    | xargs -0 grep -IHnE -e "$1" -- 2>>"$GREP_ERR" \
    | grep -vE "${LOC}.*secret-scan:allow"
}

grep_failed() {
  [ -s "$GREP_ERR" ] || return 0
  block "내용 검사를 못 돌렸다 — grep 오류" \
    "검사 없이 통과시키지 않는다: $(head -n 2 "$GREP_ERR" | tr '\n' ' ')"
}

# 보고용으로 파일:줄 만 남기고 패턴마다 세 건까지 줄인다. 전체 건수는 뒤에 따로 붙는다.
locs() { cut -d: -f1,2 | head -3 | tr '\n' ' '; }

# hard_scan <안내> <위치를 찍는 함수> — 목록 전체에 HARD 규칙을 댄다
hard_scan() {
  local e name pat hits n
  for e in "${HARD[@]}"; do
    name="${e%%|*}"; pat="${e#*|}"
    hits="$(grep_all "$pat")"
    [ -z "$hits" ] && continue
    n="$(printf '%s\n' "$hits" | wc -l | tr -d ' ')"
    block "$name — $(printf '%s\n' "$hits" | "$2")($n건)" "$1"
  done
}

# ---------------------------------------------------------------------------
# --range — PR · MR 의 커밋 이력
# ---------------------------------------------------------------------------
# 마지막 트리에 없어도 이력에 남은 키는 이미 원격에 있다. 그 키는 폐기해야 하고 이력도 정리해야 한다.
# 새 파일 이름과 HARD 규칙만 본다. 경고(SOFT)는 지난 커밋까지 되짚으면 소음이 되고,
# 숨은 문자는 지금 트리에 있어야 에이전트가 읽는다 (--all 이 본다).
if [ "$MODE" = range ]; then
  if [ -z "$RANGE_BASE" ] || ! git rev-parse -q --verify "${RANGE_BASE}^{commit}" >/dev/null; then
    say "🔴 기준 커밋 '${RANGE_BASE}' 을(를) 못 찾아 커밋 이력을 검사하지 못했다."
    say "   체크아웃이 얕다 — GitHub 은 checkout 에 fetch-depth: 0, GitLab 은 GIT_DEPTH: 0 을 준다."
    exit 1
  fi

  # 머지 커밋도 본다. git log 는 기본으로 머지의 diff 를 안 보여 줘서 충돌을 풀며 손으로 넣은 키가 빠진다.
  # remerge 는 「다시 자동으로 합친 결과」와 실제 머지의 차이라 손으로 바꾼 줄만 나온다 (git 2.36+).
  # 더 낡은 git 은 -m 으로 부모마다의 diff 를 본다. 이미 본 줄이 겹쳐 나올 뿐 빠지는 것은 없다.
  MERGES=--diff-merges=remerge
  git log -1 --format=%h "$MERGES" HEAD >/dev/null 2>&1 || MERGES=-m

  # 이름 — 이 범위에서 새로 생기거나 바뀐 파일. 빈 파일은 diff 에 줄이 없어서 이름 목록으로 따로 본다
  names="$(git log "$MERGES" --no-renames --diff-filter=AM --name-only --format='commit %h' "${RANGE_BASE}..HEAD" \
    | awk '/^commit [0-9a-f]+$/ { c = $2; next } NF { print $0 "\t" c }')" \
    || { say "🔴 커밋 이력을 못 읽었다 (git log)"; exit 1; }
  bad="$(bad_names "$(printf '%s\n' "$names" | cut -f1)" | sort -u)"
  if [ -n "$bad" ]; then
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      c="$(printf '%s\n' "$names" | awk -F'\t' -v f="$f" '$1 == f { print $2; exit }')"
      block "이력에 커밋하면 안 되는 파일: $f (커밋 $c)" \
        "마지막 커밋에서 지웠어도 원격에 남는다. 값을 폐기 · 재발급하고 그 커밋을 이력에서 뺀다."
    done <<< "$bad"
  fi

  # 내용 — 커밋마다 파일마다 추가된 줄을 번호 붙인 파일 하나로 꺼낸다. 위치는 RMAP 이 안다.
  # 경로로 폴더를 만들지 않는다. 파일 이름을 셸에 넘기면 이름에 든 글자가 명령으로 돈다.
  RDIR="$TMPD/range"; RMAP="$TMPD/range.map"
  mkdir -p "$RDIR" || exit 1
  : > "$RMAP"
  git log -p "$MERGES" --no-color --no-ext-diff --no-renames --unified=0 --format='commit %h' "${RANGE_BASE}..HEAD" \
    | LC_ALL=C awk -v dir="$RDIR" -v map="$RMAP" '
        /^commit [0-9a-f]+$/ { c = $2; hdr = 0; next }
        /^diff --git /       { hdr = 1; if (f != "") close(f); f = ""; next }
        hdr && /^\+\+\+ /    {
          if ($0 == "+++ /dev/null") next
          p = substr($0, 5); sub(/^b\//, "", p)
          n++; f = sprintf("%s/%06d", dir, n)
          printf "%06d\t%s\t%s\n", n, c, p >> map
          next
        }
        /^@@/                { hdr = 0; next }
        !hdr && /^\+/ && f != "" { print substr($0, 2) > f }'
  [ "${PIPESTATUS[0]}" -eq 0 ] || { say "🔴 커밋 이력을 못 읽었다 (git log -p)"; exit 1; }

  ( cd "$RDIR" && ls ) > "$LIST"
  # rlocs — 번호 파일:줄 을 「커밋 경로」 로 바꿔 찍는다
  rlocs() {
    cut -d: -f1 | sort -u | head -3 | while IFS= read -r i; do
      awk -F'\t' -v i="$i" '$1 == i { printf "커밋 %s %s · ", $2, $3; exit }' "$RMAP"
    done
  }
  if [ -s "$LIST" ]; then
    cd "$RDIR" || exit 1
    hard_scan "그 커밋의 값을 폐기 · 재발급하고 이력에서 뺀다. 마지막 커밋에서 지운 것으로는 안 끝난다." rlocs
    cd "$ROOT" || exit 1
    grep_failed
  fi
  finish
fi

# ---------------------------------------------------------------------------
# 스테이지 · 저장소 전체
# ---------------------------------------------------------------------------
if [ "$MODE" = all ]; then
  FILES="$(git ls-files)"
  CACHED=""
else
  FILES="$(git diff --cached --name-only --diff-filter=ACMR)"
  CACHED="--cached"
fi
[ -n "$FILES" ] || exit 0

# 1) 파일 이름 — 애초에 커밋하면 안 되는 파일
# while 을 파이프 뒤에 두면 서브셸이라 BLOCKED 가 안 남아서 변수로 받아 돈다.
BAD_NAMES="$(bad_names "$FILES")"
if [ -n "$BAD_NAMES" ]; then
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    block "커밋하면 안 되는 파일: $f" "빼는 법:  git restore --staged \"$f\"    (그리고 .gitignore 에 추가)"
  done <<< "$BAD_NAMES"
fi

# 경로에 ':' 이 있으면 면제 필터와 보고용 cut 이 둘 다 어긋난다. 잘못 판정하느니 멈춘다.
# 따옴표 · 역슬래시 · 제어문자가 든 경로는 quotePath 를 꺼도 git 이 "…" 로 감싸 내놓는다.
# 그런 경로는 [ -f ] 에서 떨어져 내용 검사를 통째로 빠져나가므로 같이 멈춘다.
#
# 🔴 파이프로 검사하지 않는다. grep -q 가 첫 일치에서 끝나면 printf 가 SIGPIPE 로 죽는다.
# pipefail 이 그 141 을 결과로 삼아서 콜론을 찾고도 거짓이 된다. 저장소가 클수록 잘 터진다.
if [[ "$FILES" == *:* ]]; then
  say ""
  say "🔴 추적 파일 경로에 ':' 이 있다. 시크릿 스캔이 그 줄을 잘못 판정하므로 멈춘다:"
  printf '%s\n' "$FILES" | grep ':' | head -5 | sed 's/^/     /' >&2
  exit 1
fi
case $'\n'"$FILES" in
  *$'\n'\"*)
    say ""
    say "🔴 경로에 따옴표 · 역슬래시 · 제어문자가 든 파일이 있다. 내용을 검사할 수 없어 멈춘다 — 이름을 바꾼다:"
    printf '%s\n' "$FILES" | grep '^"' | head -5 | sed 's/^/     /' >&2
    exit 1 ;;
esac

# 2) 파일 내용 — 형식이 확실한 것만 차단한다
# 커밋되는 것은 작업 트리가 아니라 스테이지된 내용이다. 디스크 파일을 읽으면 키를 add 한 뒤
# 작업 트리에서만 지운 커밋이 통과한다. 커밋하지 않을 수정 때문에 막히기도 한다.
SRC="$ROOT"
if [ -n "$CACHED" ]; then
  SRC="$TMPD/src"
  if ! git diff --cached --name-only -z --diff-filter=ACMR \
      | git checkout-index -z --stdin --prefix="$SRC/"; then
    say ""
    say "🔴 스테이지된 내용을 꺼내지 못해 시크릿 스캔을 못 돌렸다. 커밋을 막는다."
    exit 1
  fi
fi
cd "$SRC" || exit 1

# 이름이 example 이어도 내용은 검사한다. 예제 파일에 진짜 키를 붙여 넣는 실수가 가장 흔하다.
# 패턴마다 목록 전체를 한 번에 grep 한다. 비용이 파일 수와 상관없이 패턴 수에 비례한다.
printf '%s\n' "$FILES" | while IFS= read -r f; do
  [ -n "$f" ] && [ -f "$f" ] && printf '%s\n' "$f"
done > "$LIST"

if [ -s "$LIST" ]; then
  hard_scan "그 줄을 지우고 값은 .env 로 옮긴다. 이미 push 했다면 키를 폐기하고 재발급할 것." locs

  for e in "${SOFT[@]}"; do
    name="${e%%|*}"; pat="${e#*|}"
    hits="$(grep_all "$pat" | grep -viE "${LOC}.*(${PLACEHOLDER}|${LOCAL_HOST})")"
    [ -z "$hits" ] && continue
    n="$(printf '%s\n' "$hits" | wc -l | tr -d ' ')"
    warn "$name — $(printf '%s\n' "$hits" | locs)($n건)" \
      "진짜 값이면 빼고, 아니면 그 줄 끝에 secret-scan:allow 를 붙인다."
  done
  grep_failed
fi
cd "$ROOT" || exit 1

# 3) 규칙 파일에 숨은 문자
# 에이전트가 지시로 읽는 파일이다. 보이지 않는 문자로 숨긴 지시는 리뷰하는 사람 눈에는 안 보이고
# 에이전트에게만 읽힌다. Claude Code 말고 같은 저장소를 여는 다른 도구의 파일도 본다 —
# AGENTS.md(Codex · Copilot · Cursor 공용) · GEMINI.md · Cursor · Copilot · Windsurf · Cline 의 규칙.
# UTF-8 바이트로 찾는다. grep -P 는 macOS · busybox 에 없다. 글자 해석도 로캘마다 달라진다.
# ZWNJ(U+200C)를 글자에 쓰는 언어(페르시아어 등)로 규칙 파일을 쓰는 팀은 그 줄을 뺀다.
# 한자 이체자 선택자(U+E0100–E01EF)를 쓰는 일본어 문서도 같다.
# 한글 채움 문자(U+115F · 1160 · 3164 · FFA0)는 요즘 한국어 글에 안 쓰인다 — 빈칸처럼 보이게 숨기는 데 쓰인다.
RULE_FILES='(^|/)(CLAUDE|CLAUDE\.local|AGENTS|GEMINI)\.md$|(^|/)\.(claude|agents|gemini|cursor|windsurf)/|(^|/)\.(cursorrules|windsurfrules)$|(^|/)\.clinerules(/|$)|(^|/)\.github/(copilot-instructions\.md$|instructions/|prompts/|agents/)'
HIDDEN=(
  '\302\255'                                                                  # U+00AD 소프트 하이픈
  '\341\205\237' '\341\205\240' '\343\205\244' '\357\276\240'                 # U+115F · 1160 · 3164 · FFA0 한글 채움 문자
  '\342\200\213' '\342\200\214' '\342\200\215' '\342\200\216' '\342\200\217'  # U+200B–200F
  '\342\200\250' '\342\200\251'                                               # U+2028 · 2029 줄 · 문단 구분
  '\342\200\252' '\342\200\253' '\342\200\254' '\342\200\255' '\342\200\256'  # U+202A–202E
  '\342\201\240' '\342\201\241' '\342\201\242' '\342\201\243' '\342\201\244'  # U+2060–2064
  '\342\201\246' '\342\201\247' '\342\201\250' '\342\201\251'                 # U+2066–2069
  '\363\240\200' '\363\240\201'                                               # U+E0000–E007F
  '\363\240\204' '\363\240\205' '\363\240\206' '\363\240\207'                 # U+E0100–E01EF 이체자 선택자
  '\357\273\277'                                                              # U+FEFF
)

# hidden_only — git grep 이 찾은 파일:줄:내용 에서 정말 숨은 문자가 남은 줄만 파일:줄: 로 낸다.
# ZWJ(U+200D)는 이모지를 잇는 데도 쓰여서 앞뒤가 이모지면 놔둔다. 파일 첫머리 BOM(U+FEFF)은 편집기가 붙인 것이다.
hidden_only() {
  LC_ALL=C awk -v patfile="$PAT" '
    BEGIN {
      while ((getline p < patfile) > 0) pat[++np] = p
      zwj = "\342\200\215"; bom = "\357\273\277"; vs16 = "\357\270\217"
    }
    match($0, /^[^:]*:[0-9]+:/) {
      head = substr($0, 1, RLENGTH); s = substr($0, RLENGTH + 1)
      split(head, h, ":")
      if (h[2] == 1 && substr(s, 1, 3) == bom) s = substr(s, 4)
      out = ""
      while ((i = index(s, zwj)) > 0) {
        pre = out substr(s, 1, i - 1); s = substr(s, i + 3); n = length(pre)
        before = (n >= 4 && substr(pre, n - 3, 2) == "\360\237") || (n >= 3 && substr(pre, n - 2) == vs16)
        a = substr(s, 1, 2)
        after = (a == "\360\237" || a == "\342\231" || a == "\342\232" || a == "\342\235")
        out = (before && after) ? pre : pre zwj
      }
      s = out s
      for (k = 1; k <= np; k++) if (index(s, pat[k])) { print head; break }
    }'
}

RULES=()
while IFS= read -r f; do
  [ -n "$f" ] && RULES+=("$f")
done <<< "$(printf '%s\n' "$FILES" | grep -E "$RULE_FILES")"

if [ "${#RULES[@]}" -gt 0 ]; then
  PAT="$TMPD/hidden"
  # shellcheck disable=SC2059  # 8진수 이스케이프를 바이트로 풀려고 형식 자리에 둔다
  for b in "${HIDDEN[@]}"; do printf "$b\n"; done > "$PAT"
  # C 로캘이라야 git grep 이 패턴을 글자가 아니라 바이트로 맞춘다.
  # hidden_only 는 파일:줄:내용 모양만 읽어서 출력 모양을 바꾸는 설정을 끈다.
  # color.ui · color.grep 이 always 면 파이프에도 색 코드가 붙어 한 줄도 못 읽고 검사 없이 초록이 된다.
  # grep.column 이 true 면 열 번호가 끼어 1행 BOM 을 못 알아본다. BOM 을 꼭 둬야 하는 install.ps1 이 막힌다.
  # --no-column 은 git 2.19 미만이 몰라서 설정(-c)으로 끈다.
  uni="$(LC_ALL=C git -c grep.column=false --literal-pathspecs grep --no-color ${CACHED:+"$CACHED"} -I -n -F -f "$PAT" -- "${RULES[@]}")"
  rc=$?
  if [ "$rc" -gt 1 ]; then
    block "규칙 파일의 숨은 문자 — 검사를 못 돌렸다 (git grep rc=$rc)" \
      "검사 없이 통과시키지 않는다. git 이 이 저장소를 읽는지 확인한다."
  elif [ -n "$uni" ]; then
    # 면제 표시(secret-scan:allow)를 받지 않는다. HTML 주석으로 단 면제 표시는 렌더된 마크다운에서
    # 안 보여서 숨긴 지시와 같이 리뷰를 지나간다.
    hits="$(printf '%s\n' "$uni" | hidden_only)"
    if [ -n "$hits" ]; then
      n="$(printf '%s\n' "$hits" | wc -l | tr -d ' ')"
      block "규칙 파일의 보이지 않는 문자 — $(printf '%s\n' "$hits" | locs)($n건)" \
        "사람 눈에 안 보이는 지시가 숨어 있을 수 있다. 편집기에서 보이지 않는 문자 표시를 켜고 그 줄을 다시 쓴다."
    fi
  fi
fi

finish
