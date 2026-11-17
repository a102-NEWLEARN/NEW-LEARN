#!/usr/bin/env bash
#
# MR · PR 규칙 검사. CI 의 convention 잡이 이 파일을 부른다 (ci/*.yml 에 주석으로 둔 잡을 풀어 켠다).
# 실패하면 파이프라인이 빨개지고 「머지 전 파이프라인 통과」 설정이 머지 버튼을 잠근다.
#
# 🔴 커밋 제목 규칙을 여기 다시 적지 않는다. 같은 폴더의 commit-msg 를 그대로 부른다.
# 두 곳에 적으면 로컬 훅과 CI 의 규칙이 갈라진다.
#
# 훅이 커밋 하나만 봐서는 모르는 것을 더 본다. 전부 팀이 .claude/stack.md §3 에 적었을 때만 본다.
#   ① 브랜치 이름 — BRANCH_TYPES 를 적었을 때
#   ② MR 안의 모든 커밋 — 훅을 안 깐 사람의 커밋, cherry-pick · rebase 로 들어온 커밋도 여기서 걸린다
#   ③ 브랜치 이름에 이슈키 번호가 있으면 커밋 · MR 제목에 붙은 키 가운데 하나가 그 번호인지 — COMMIT_ISSUE_KEY 를 적었을 때
#   ④ MR 제목 — 커밋 제목과 같은 규칙이라 같은 훅에 태운다
#
# 본문의 「왜」 · 한 커밋 한 가지 일 · 변경 크기 · 이슈 상태는 못 본다.
# 초록이어도 사람이 봐야 한다.
#
# 선언의 뜻은 .claude/stack.md §3. DEFAULT_BRANCH 를 비우면 main 을 기준으로 본다.
#
# 브랜치 이름과 target 은 GitLab MR 변수에서 읽고, 없으면 GitHub PR 변수에서 읽는다.
# MR 제목은 CI_MERGE_REQUEST_TITLE 로만 받는다. GitHub 잡은 PR 제목을 이 이름으로 넘긴다.
#
# 로컬에서 미리 돌리기: bash .claude/hooks/mr-check.sh

set -uo pipefail

root="$(git rev-parse --show-toplevel)" || exit 1
STACK="$root/.claude/stack.md"

hook="$root/.claude/hooks/commit-msg"
[ -f "$hook" ] || { printf '!! %s 가 없다\n' "$hook" >&2; exit 1; }
# COMMIT_* 선언은 훅 한 곳에서 검사한다. 메시지 없이 부르면 훅은 선언만 보고 끝난다.
# 여기서 안 멈추면 선언 오류가 커밋마다 제목 탓으로 되풀이해 찍힌다.
bash "$hook" || exit 1

bad_config() {
  printf '\n!! .claude/stack.md §3 의 선언이 형식에 안 맞는다: %s\n' "$1" >&2
  printf '   %s\n' "$2" >&2
  printf '   규칙을 안 쓰려면 "" 로 비운다.\n\n' >&2
  exit 1
}

COMMIT_TYPES=""
COMMIT_ISSUE_KEY=""
BRANCH_TYPES=""
DEFAULT_BRANCH=""
if [ -f "$STACK" ]; then
  # CR 을 뗀다 — Windows 에서 받은 stack.md 를 Linux 에서 읽어도 선언이 살게
  decl="$(awk '{ sub(/\r$/, "") } /^```sh$/{f=1;next} f&&/^```$/{exit} f' "$STACK" \
    | grep -E '^[[:space:]]*(export[[:space:]]+)?(COMMIT_TYPES|COMMIT_ISSUE_KEY|BRANCH_TYPES|DEFAULT_BRANCH)=')"
  # 따옴표를 빼거나 들여 쓰면 대입이 안 돼서 규칙이 조용히 꺼진다. commit-msg 와 같은 기준이다.
  odd="$(printf '%s\n' "$decl" \
    | grep -vE '^(COMMIT_TYPES|COMMIT_ISSUE_KEY|BRANCH_TYPES|DEFAULT_BRANCH)="[^"]*"[[:space:]]*(#.*)?$' \
    | grep . | head -n 1)"
  [ -z "$odd" ] || bad_config "$odd" '한 줄에 이름="값" 으로 적고 값은 큰따옴표로 감싼다'
  eval "$decl"
fi
for v in COMMIT_TYPES COMMIT_ISSUE_KEY BRANCH_TYPES DEFAULT_BRANCH; do
  case "$(eval printf '%s' "\"\${$v}\"")" in *"채워넣기"*) eval "$v=''" ;; esac
done

if [ -z "$COMMIT_TYPES$COMMIT_ISSUE_KEY$BRANCH_TYPES" ]; then
  printf '규칙 검사 — .claude/stack.md §3 에 적은 규칙이 없어 보지 않는다\n'
  exit 0
fi

if [ -n "$BRANCH_TYPES" ] \
   && ! printf '%s' "$BRANCH_TYPES" | grep -qE '^[A-Za-z][A-Za-z0-9-]*(\|[A-Za-z][A-Za-z0-9-]*)*$'; then
  bad_config "BRANCH_TYPES=\"$BRANCH_TYPES\"" '영문 타입을 | 로 구분해 적는다. 예: "feat|fix|hotfix"'
fi

KEY="$COMMIT_ISSUE_KEY"
DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"

fails=0
bad()  { printf '\n!! %s\n' "$1" >&2; fails=$((fails + 1)); }
note() { printf '   %s\n' "$1" >&2; }

branch="${CI_MERGE_REQUEST_SOURCE_BRANCH_NAME:-${GITHUB_HEAD_REF:-$(git rev-parse --abbrev-ref HEAD)}}"
target="${CI_MERGE_REQUEST_TARGET_BRANCH_NAME:-${GITHUB_BASE_REF:-$DEFAULT_BRANCH}}"

# 분리된 HEAD 면 브랜치 이름을 모른다. 브랜치를 보는 검사(① · ③)만 영향을 받는다.
# CI 에서는 변수가 안 넘어온 설정 실수라 실패로 알리고, 로컬에서는 알리고 건너뛴다.
if [ "$branch" = HEAD ]; then
  branch=""
  if [ -n "$BRANCH_TYPES$KEY" ]; then
    if [ -n "${CI:-}" ]; then
      bad "브랜치 이름을 못 읽었다 (분리된 HEAD)"
      note "GitLab 은 MR 파이프라인에서, GitHub 은 pull_request 이벤트에서 돌려야 브랜치 이름이 넘어온다"
    else
      note "브랜치 이름을 못 읽어서 (분리된 HEAD) 브랜치 이름 · 이슈키 대조는 건너뛴다"
    fi
  fi
fi

# 🔴 범위를 MR 의 diff base 부터 잡지 않는다 (CI_MERGE_REQUEST_DIFF_BASE_SHA).
# target 을 머지해 둔 브랜치에서 base 가 옛 지점이면 남의 커밋이 섞여 엉뚱한 이슈키로 실패한다.
# 「HEAD 에서 닿고 target 에서 안 닿는 커밋」으로 잡으면 리베이스든 머지든 이 MR 의 커밋만 남는다.
if [ -n "${CI:-}" ]; then
  shallow="$(git rev-parse --is-shallow-repository 2>/dev/null)"
  if [ "${GITHUB_ACTIONS:-}" = true ] && [ "$shallow" != true ] \
     && git rev-parse -q --verify "refs/remotes/origin/$target" >/dev/null; then
    # GitHub checkout 의 fetch-depth: 0 은 모든 브랜치를 받아 둔다. 다시 받으려면 자격이 필요한데
    # 게이트는 checkout 에 토큰을 남기지 않는다 (persist-credentials: false).
    exclude="origin/$target"
  else
    # 얕은 클론이면 MR 의 오래된 커밋이 범위에서 조용히 빠진다. target 을 받을 때 전체 이력으로 푼다.
    # GitLab 은 작업 폴더를 다시 쓰면 origin/<target> 이 낡아 있을 수 있어서 늘 새로 받는다.
    deep=""
    [ "$shallow" = true ] && deep="--unshallow"
    # shellcheck disable=SC2086
    git fetch -q $deep origin "$target" || { printf '!! origin/%s 를 못 받았다\n' "$target" >&2; exit 1; }
    exclude="FETCH_HEAD"
  fi
else
  exclude="origin/$target"
  git rev-parse -q --verify "$exclude" >/dev/null \
    || { printf '!! %s 가 없다 — git fetch origin %s 를 먼저 한다\n' "$exclude" "$target" >&2; exit 1; }
fi

# --- ① 브랜치 이름 ---------------------------------------------------------
# 타입 뒤는 팀마다 달라서 보지 않는다 (feat/login · feat/PROJ-12-login 둘 다 된다).
if [ -n "$BRANCH_TYPES" ] && [ -n "$branch" ] \
   && ! printf '%s' "$branch" | grep -qE "^(${BRANCH_TYPES})/[^[:space:]]+$"; then
  bad "브랜치 이름이 .claude/stack.md §3 규칙에 안 맞는다: $branch"
  note "모양: <타입>/<이름>"
  note "타입: ${BRANCH_TYPES}"
fi
# 브랜치 이름은 소문자로 쓰는 팀이 많다 (feat/proj-12-login). 대소문자를 가리면 ③ 이 말없이 꺼진다.
branch_no=""
[ -n "$KEY" ] && [ -n "$branch" ] \
  && branch_no="$(printf '%s' "$branch" | tr '[:lower:]' '[:upper:]' \
                  | sed -nE "s#^(.*[^A-Z0-9])?${KEY}-([0-9]+).*#\2#p")"

# 제목에 붙은 이슈키 가운데 하나라도 브랜치 번호와 같으면 맞다고 본다.
# 하나도 안 맞으면 그 키들을 찍고 참을 돌려준다.
keys_off() {
  local keys
  [ -n "$KEY" ] && [ -n "$branch_no" ] || return 1
  keys="$(printf '%s' "$1" | grep -oE "\[${KEY}-[0-9]+\]" | grep -oE "${KEY}-[0-9]+")"
  [ -n "$keys" ] || return 1
  printf '%s\n' "$keys" | grep -qx "${KEY}-${branch_no}" && return 1
  echo $keys   # 줄바꿈을 공백으로
}

# --- ② 커밋 제목 · ③ 이슈키 일치 -------------------------------------------
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

commits="$(git log --no-merges --format=%H HEAD --not "$exclude")"
n_commits="$(printf '%s' "$commits" | grep -c . || true)"

if [ "$n_commits" -eq 0 ]; then
  bad "검사할 커밋이 없다 ($exclude 기준)"
  note "MR 이 비어 있거나 target 브랜치를 잘못 잡았다"
fi

for sha in $commits; do
  short="$(git rev-parse --short "$sha")"
  title="$(git log -1 --format=%s "$sha")"
  git log -1 --format=%B "$sha" >"$tmp"

  # 저장된 메시지라 git 이 이미 주석 줄을 지웠다. GIT_EDITOR=: 로 넘겨야 '#12 …' 도 제목으로 본다.
  # MR_CHECK=1 — 로컬에서는 건너뛰는 fixup! · squash! · amend! 를 여기서는 막는다
  if ! out="$(GIT_EDITOR=: MR_CHECK=1 bash "$hook" "$tmp" 2>&1)"; then
    bad "커밋 $short"
    printf '%s\n' "$out" | sed '/^$/d; s/^/   /' >&2
  fi

  if off="$(keys_off "$title")"; then
    bad "커밋 $short 의 이슈키가 브랜치와 다르다"
    note "커밋: ${off} · 브랜치: ${KEY}-${branch_no}"
    note "이슈 1개 = 브랜치 1개 = MR 1개"
  fi
done

# --- ④ MR 제목 -------------------------------------------------------------
# MR 파이프라인 밖에서는 이 변수가 없어서 건너뛴다. 실패로 치면 로컬에서 미리 돌려 볼 수가 없다.
mr_title="${CI_MERGE_REQUEST_TITLE:-}"
if [ -n "$mr_title" ]; then
  # GitLab 이 초안 표시로 받는 머리말은 떼고 본다.
  # 초안이라고 건너뛰지 않는다. 일찍 알수록 고치기 쉽다.
  clean_title="$(printf '%s' "$mr_title" | sed -E 's/^(\[[Dd]raft\]|\([Dd]raft\)|[Dd]raft:|WIP:)[[:space:]]*//')"
  printf '%s\n' "$clean_title" >"$tmp"
  if ! out="$(GIT_EDITOR=: MR_CHECK=1 bash "$hook" "$tmp" 2>&1)"; then
    bad "MR 제목"
    printf '%s\n' "$out" | sed '/^$/d; s/^/   /' >&2
  fi

  if off="$(keys_off "$clean_title")"; then
    bad "MR 제목의 이슈키가 브랜치와 다르다"
    note "제목: ${off} · 브랜치: ${KEY}-${branch_no}"
  fi
fi

# --- 결과 -----------------------------------------------------------------
if [ "$fails" -gt 0 ]; then
  printf '\n규칙 검사 실패 %s건 — 선언은 .claude/stack.md §3\n' "$fails" >&2
  # 이 안내가 없으면 「고쳤는데 왜 아직 빨간불이냐」로 시간을 쓴다.
  # GitHub 은 pull_request 의 기본 트리거에 제목 수정(edited)이 없어서 따로 안내한다.
  if [ "${GITHUB_ACTIONS:-}" = true ]; then
    printf 'PR 제목만 고쳤다면 convention 워크플로가 edited 를 받게 둔 경우에만 다시 돈다 — .claude/ci/github-actions.yml 의 convention 주석\n' >&2
  else
    printf 'MR 제목·설명만 고쳤다면 파이프라인은 다시 돌지 않는다. MR 화면에서 재실행할 것.\n' >&2
  fi
  exit 1
fi

printf '규칙 검사 통과 — 브랜치 %s · 커밋 %s개\n' "${branch:-(모름)}" "$n_commits"
