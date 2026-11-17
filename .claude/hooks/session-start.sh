#!/usr/bin/env bash
#
# 대화를 시작할 때 Claude Code 훅(settings.json 의 SessionStart)이 부른다. 찍은 글은 Claude 가 읽는다.
#
#   bash .claude/hooks/session-start.sh
#
# 알리는 것
#   - 지금 브랜치
#   - git 훅이 .claude/hooks 를 보는지 — 안 보면 커밋 게이트가 없다
#   - stack.md 에 남은 빈칸(<채워넣기>)을 절마다 센다. §3 은 명령 자리라 따로 알린다
#     빈칸 하나에도 같은 경고를 매번 띄우면 경고를 안 읽게 된다. 어디에 몇 칸인지 한 줄로 찍는다
#
# 늘 0 으로 끝난다. 0 이 아니면 대화를 시작할 때마다 훅 오류로 보인다.
# 고친 뒤:  bash .claude/hooks/tests/test-session-start.sh

set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

b="$(git branch --show-current 2>/dev/null)"
[ -n "$b" ] && echo "브랜치: $b"

if git rev-parse --git-dir >/dev/null 2>&1; then
  h="$(git config core.hooksPath 2>/dev/null)"
  [ "$h" = .claude/hooks ] \
    || echo "⚠️ git 훅이 .claude/hooks 를 안 본다 (지금: ${h:-없음}) — bash .claude/hooks/install.sh 를 돌릴 것 (다른 훅 도구에서 부르게 했으면 무시)"
fi

S=.claude/stack.md
[ -f "$S" ] || exit 0

# 절 머리는 「## <숫자>.」 모양이다. CR 을 떼고 센다 — Windows 에서 받은 파일도 같게 센다.
# LC_ALL=C — 한글 글자를 바이트로 맞춘다. 로캘마다 결과가 달라지지 않게.
counts="$(LC_ALL=C awk '
  { sub(/\r$/, "") }
  /^## [0-9]+\./ { sec = $2; sub(/\.$/, "", sec) }
  sec != "" { n = gsub(/<채워넣기>/, "&"); if (n) c[sec] += n }
  END { for (s in c) print s, c[s] }' "$S" | sort -n)"
[ -n "$counts" ] || exit 0

# §3 의 AREAS 가 비었으면 아직 안 심은 것이다. 칸 수는 의미가 없어 심으라고만 한다
if LC_ALL=C grep -qE '^AREAS="?<채워넣기>' "$S"; then
  echo "⚠️ stack.md 를 아직 안 채웠다 — 처음이면 /harness-init 으로 심는다"
  exit 0
fi

line=""
s3=0
while read -r s n; do
  [ -n "$s" ] || continue
  [ "$s" = 3 ] && s3="$n"
  line="${line:+$line · }§$s $n"
done <<< "$counts"
if [ "$s3" -gt 0 ]; then
  echo "⚠️ stack.md §3(명령)에 빈칸 ${s3}개 — 비운 단계는 커밋 게이트가 건너뛰고 CI 는 실패한다. 값을 알면 먼저 채운다"
fi
echo "stack.md 남은 빈칸: $line — 값을 알게 된 칸부터 채운다"
exit 0
