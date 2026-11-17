#!/usr/bin/env bash
#
# 템플릿 새 버전을 이미 심은 프로젝트에 들인다. 프로젝트 저장소 안에서 돌린다 (Git Bash).
#
#   bash .claude/hooks/upgrade.sh <템플릿 경로> [새 버전]
#     예) bash .claude/hooks/upgrade.sh ~/Downloads/template          # 템플릿의 마지막 태그로
#         bash .claude/hooks/upgrade.sh ~/Downloads/template 2.0.0
#
# 하는 일
#   1. 커밋 안 한 변경이 있으면 시작하지 않는다. 3-way 적용은 변경이 하나만 있어도 통째로 실패한다
#   2. 지금 버전(.claude/VERSION)과 새 버전의 태그가 템플릿에 있는지 본다
#   3. 두 버전의 .claude/ 차이만 3-way 로 얹는다. 프로젝트가 지운 파일 · 폴더는 빼고 얹는다
#   4. 얹은 것이 있을 때만 VERSION 을 올린다. 아무것도 못 얹었으면 그대로 두고 멈춘다
#   5. CI 파일(.github/workflows/gate.yml · .gitlab-ci.yml)도 같은 방식으로 합친다
#   6. stack.md 에 새로 생긴 칸 · 선언 이름을 찍는다. 충돌을 풀다가 새 칸을 지우지 않게
#
# 끝나는 코드  0 깨끗이 얹음 · 1 아무것도 안 바꾸고 멈춤 · 2 얹었지만 충돌을 풀어야 함
# 고친 뒤:  bash .claude/hooks/tests/test-upgrade.sh

set -uo pipefail

say()  { printf '%s\n' "$*"; }
stop() { printf '!! %s\n' "$*" >&2; exit 1; }

[ $# -ge 1 ] || stop "템플릿 경로를 준다 — bash .claude/hooks/upgrade.sh <템플릿 경로> [새 버전]"
TPL="$1"
NEW="${2:-}"

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || stop "git 저장소 안에서 돌린다"
cd "$ROOT" || exit 1
[ -f .claude/VERSION ] || stop ".claude/VERSION 이 없다 — 하네스를 심은 저장소가 아니다"
TPL="$(cd "$TPL" 2>/dev/null && pwd)" || stop "템플릿 경로를 못 연다: $1"
git -C "$TPL" rev-parse --git-dir >/dev/null 2>&1 || stop "템플릿 경로가 git 저장소가 아니다: $TPL"

# 1) 깨끗한가. 추적 안 하는 파일은 상관없다 — 새 버전이 그 자리에 파일을 만들면 적용이 실패해서 멈춘다
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git status --short --untracked-files=no | head -10 >&2
  stop "커밋 안 한 변경이 있다. 커밋하거나 치운 뒤 다시 돌린다"
fi

# 2) 버전과 태그
CUR="$(tr -d '\r\n ' < .claude/VERSION)"
[ -n "$NEW" ] || NEW="$(git -C "$TPL" describe --tags --abbrev=0 2>/dev/null | sed 's/^v//')"
[ -n "$NEW" ] || stop "템플릿에 태그가 없다. 새 버전을 직접 준다"
for v in "$CUR" "$NEW"; do
  git -C "$TPL" rev-parse -q --verify "refs/tags/v$v^{commit}" >/dev/null \
    || stop "템플릿에 v$v 태그가 없다. 있는 태그: $(git -C "$TPL" tag -l 'v*' | tr '\n' ' ')
   지금 버전이 태그에 없으면 이 프로젝트를 심을 때 쓴 가장 가까운 태그로 .claude/VERSION 을 고쳐 커밋한 뒤 다시 돌린다"
done
if [ "$CUR" = "$NEW" ]; then
  say "이미 v$NEW 이다. 할 것이 없다"
  exit 0
fi
say "== 하네스 v$CUR → v$NEW"

TMP="$(mktemp -d)" || exit 1
trap 'rm -rf "$TMP"' EXIT

# 3-way 로 합치려면 템플릿 쪽 파일 내용이 이 저장소에도 있어야 한다. 객체만 받는다 (브랜치 · 태그는 안 생긴다)
git fetch -q --no-tags "$TPL" "refs/tags/v$CUR" "refs/tags/v$NEW" || stop "템플릿에서 두 태그를 못 받았다"

# 3) 프로젝트가 지운 것은 빼고 얹는다. 폴더째 지웠으면 폴더째 뺀다 — 새 버전이 그 폴더에 새 파일을 넣어도 살아나지 않게
EXCL=()
gone=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ -e "$f" ] && continue
  d="${f%/*}"
  top=""
  while [ "$d" != ".claude" ] && [ -n "$d" ] && [ ! -d "$d" ]; do top="$d"; d="${d%/*}"; done
  if [ -n "$top" ]; then
    case " $gone " in *" $top/ "*) continue ;; esac
    gone="$gone $top/"
    EXCL+=("--exclude=$top/*")
  else
    gone="$gone $f"
    EXCL+=("--exclude=$f")
  fi
done <<< "$(git -C "$TPL" ls-tree -r --name-only "v$CUR" -- .claude)"
[ -n "$gone" ] && say "   프로젝트가 지운 것은 빼고 얹는다:$gone"

git -C "$TPL" diff --binary --full-index "v$CUR" "v$NEW" -- .claude ':(exclude).claude/VERSION' > "$TMP/up.patch"
conflicts=""
if [ -s "$TMP/up.patch" ]; then
  git apply --3way --whitespace=nowarn ${EXCL[@]+"${EXCL[@]}"} "$TMP/up.patch" > "$TMP/apply.log" 2>&1
  # 적용 결과는 종료 코드로 못 가른다. 충돌이 나도 1 이고, 하나도 못 얹어도 1 이다. 바뀐 파일로 가른다
  if [ -z "$(git status --porcelain -- .claude)" ]; then
    grep -E '^(error|fatal):' "$TMP/apply.log" | head -10 >&2
    stop "아무것도 못 얹었다. VERSION 은 v$CUR 그대로 두었다"
  fi
  conflicts="$(git diff --name-only --diff-filter=U)"
  say "   얹은 파일: $(git status --porcelain -- .claude | grep -c .)개"
else
  say "   .claude/ 에 바뀐 파일이 없다 (VERSION 만 올린다)"
fi

# 4) 얹은 뒤에만 VERSION
printf '%s\n' "$NEW" > .claude/VERSION
git add .claude/VERSION

# 5) CI 파일. 프로젝트가 채운 값(런타임 · 브랜치)은 남기고 템플릿이 바꾼 부분만 들인다
merge_ci() {
  local live="$1" src="$2" n
  [ -f "$live" ] || return 0
  git -C "$TPL" cat-file -e "v$CUR:$src" 2>/dev/null || return 0
  git -C "$TPL" show "v$CUR:$src" > "$TMP/base"
  git -C "$TPL" show "v$NEW:$src" > "$TMP/new" 2>/dev/null || return 0
  cmp -s "$TMP/base" "$TMP/new" && return 0
  git merge-file -L "프로젝트" -L "v$CUR" -L "v$NEW" "$live" "$TMP/base" "$TMP/new"
  n=$?
  if [ "$n" -eq 0 ]; then
    say "   CI 파일 합침: $live"
    git add "$live"
  else
    say "   CI 파일 충돌 ${n}곳: $live"
    conflicts="$conflicts
$live"
  fi
}
merge_ci .github/workflows/gate.yml .claude/ci/github-actions.yml
merge_ci .gitlab-ci.yml .claude/ci/gitlab-ci.yml
if [ -f .github/workflows/gate.yml ] && [ ! -f .github/dependabot.yml ] \
   && git -C "$TPL" cat-file -e "v$NEW:.claude/ci/dependabot.yml" 2>/dev/null; then
  say "   새 파일: .claude/ci/dependabot.yml → .github/dependabot.yml 로 복사한다 (/harness-init 8단계)"
fi

# 6) stack.md 에 새로 생긴 칸. 충돌을 「프로젝트 쪽」으로만 풀면 이 칸들이 말없이 사라진다
if git cat-file -e HEAD:.claude/stack.md 2>/dev/null; then
  # 표의 첫 칸(| 이름 |)과 §3 sh 블록의 선언 이름(전역 이름 · <영역>_ 틀 줄)을 비교한다
  rows() { grep -oE '^\| [^|]+ \|' | sed 's/^| //; s/ |$//' | sort -u; }
  keys() {
    awk '{ sub(/\r$/, "") } /^```sh$/{f=1;next} f&&/^```$/{exit} f' \
      | sed -n -E 's/^([A-Z][A-Z0-9_]*)=.*/\1/p; s/^# <영역>_([A-Z_]+)=.*/<영역>_\1/p' | sort -u
  }
  git -C "$TPL" show "v$NEW:.claude/stack.md" > "$TMP/stack.new"
  git show HEAD:.claude/stack.md > "$TMP/stack.old"
  newrows="$(comm -23 <(rows < "$TMP/stack.new") <(rows < "$TMP/stack.old"))"
  newkeys="$(comm -23 <(keys < "$TMP/stack.new") <(keys < "$TMP/stack.old"))"
  if [ -n "$newrows$newkeys" ]; then
    say "   stack.md 에 새로 생긴 칸 — 충돌을 풀어도 남아 있어야 한다. 채우거나 「해당 없음 — <이유>」 로 닫는다:"
    [ -n "$newrows" ] && printf '%s\n' "$newrows" | sed 's/^/     · /'
    [ -n "$newkeys" ] && printf '%s\n' "$newkeys" | sed 's/^/     · §3 선언 /'
  fi
fi

say ""
conflicts="$(printf '%s\n' "$conflicts" | grep . | sort -u)"
if [ -n "$conflicts" ]; then
  say "충돌을 풀어야 하는 파일 (<<<<<<< 프로젝트 쪽 · >>>>>>> 새 템플릿 쪽):"
  printf '%s\n' "$conflicts" | sed 's/^/   /'
  say "다 풀면: git add <파일> → bash .claude/hooks/tests/run.sh → /health-check L0 → 커밋"
  exit 2
fi
say "다음: bash .claude/hooks/tests/run.sh → /health-check L0 → 커밋 (예: harness: 템플릿 v$NEW 로 올린다)"
exit 0
