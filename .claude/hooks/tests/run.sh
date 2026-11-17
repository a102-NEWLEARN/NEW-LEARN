#!/usr/bin/env bash
#
# 하네스 자체 검사를 한 번에 돌린다. CI 껍데기(ci/*.yml)와 /health-check 가 이 파일 하나만 부른다.
# 검사를 더하려면 이 폴더에 test-*.sh 로 두기만 한다. 목록을 여기나 CI 에 다시 적지 않는다.
#
#   bash .claude/hooks/tests/run.sh
#
# 하나가 실패해도 끝까지 돌린다. 어느 것이 깨졌는지 한 번에 보게.

set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
failed=""
n=0
for t in "$DIR"/test-*.sh; do
  [ -f "$t" ] || continue
  n=$((n + 1))
  printf '\n== %s\n' "${t##*/}"
  bash "$t" || failed="$failed ${t##*/}"
done

# 테스트를 하나도 못 찾았으면 검사 0개짜리 초록이다
[ "$n" -gt 0 ] || { printf '!! %s 에 test-*.sh 가 없다\n' "$DIR"; exit 1; }

if [ -n "$failed" ]; then
  printf '\n!! 하네스 자체 검사 실패:%s\n' "$failed"
  exit 1
fi
printf '\n하네스 자체 검사 %s개 통과\n' "$n"
