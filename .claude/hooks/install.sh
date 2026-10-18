#!/usr/bin/env bash
#
# git 훅 설치. 저장소마다 한 번씩 돌린다.
#
#   bash .claude/hooks/install.sh            # core.hooksPath 가 다른 곳을 가리키면 멈춘다
#   bash .claude/hooks/install.sh --force    # 알고 덮을 때
#
# ⚠️ core.hooksPath 는 로컬 git 설정이라 커밋해도 팀원에게 자동 적용되지 않는다.
#    각자 한 번씩 돌려야 한다. 안 돌린 사람은 게이트 없이 일하게 된다 —
#    그래서 대화 시작 훅(settings.json)이 매번 설치 여부를 확인한다.

set -uo pipefail

force=0
case "${1:-}" in
  "") ;;
  --force) force=1 ;;
  *) echo "!! 모르는 인자: $1 (쓸 수 있는 것: --force)"; exit 1 ;;
esac

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "!! git 저장소가 아니다. 먼저 'git init' 을 할 것."
  exit 1
}
cd "$ROOT" || exit 1

HOOKDIR=".claude/hooks"
[ -d "$HOOKDIR" ] || { echo "!! $HOOKDIR 가 없다. 저장소 루트에서 돌릴 것."; exit 1; }

echo "== git 훅 설치 =="
echo "   저장소: $ROOT"

# ---------------------------------------------------------------------------
# 1) 기존 훅 확인 — 파일을 고치기 전에 본다. 멈출 일이면 아무것도 안 바꾼 채 멈춘다
# ---------------------------------------------------------------------------
# core.hooksPath 를 바꾸면 기본 훅 폴더는 통째로 무시된다.
# 워크트리에서는 .git 이 파일이라 .git/hooks 를 못 읽는다. 공용 git 폴더에 묻는다.
# --git-path hooks 는 이미 걸린 core.hooksPath 를 돌려줘서 쓰지 않는다.
olddir="$(git rev-parse --git-common-dir 2>/dev/null)/hooks"
existing="$(ls "$olddir" 2>/dev/null | grep -v '\.sample$' || true)"
if [ -n "$existing" ]; then
  echo ""
  echo "⚠️  $olddir 에 이미 훅이 있다:"
  printf '     %s\n' $existing
  echo "   설치하면 이 훅들은 더 이상 실행되지 않는다."
  echo "   계속 쓰려면 $HOOKDIR/ 로 옮긴 뒤 다시 돌릴 것."
  echo ""
fi

# 훅 도구는 저마다 core.hooksPath 나 .git/hooks 를 차지해서 이 설치와 나란히 돌 수 없다.
# 고쳐 주지는 않는다. 그 도구 쪽에서 부르는 길만 알린다.
tools=""
[ -d .husky ] && tools="$tools husky"
[ -f .pre-commit-config.yaml ] && tools="$tools pre-commit"
# lefthook 은 yml 말고 toml · json 도 읽고 .config/ 아래도 찾는다
for c in lefthook.* .lefthook.* .config/lefthook.*; do
  [ -f "$c" ] && { tools="$tools lefthook"; break; }
done
if [ -n "$tools" ]; then
  echo ""
  echo "⚠️  다른 훅 도구를 쓰는 저장소다:$tools"
  echo "   그 도구를 계속 쓰려면 이 설치 대신, 그 도구의 pre-commit 에서 bash $HOOKDIR/pre-commit,"
  echo "   commit-msg 에서 bash $HOOKDIR/commit-msg \"\$1\" 를 부르게 한다."
fi

# 말없이 덮으면 그쪽 훅이 조용히 꺼진다
cur="$(git config core.hooksPath || true)"
if [ -n "$cur" ] && [ "$cur" != "$HOOKDIR" ]; then
  echo ""
  echo "!! core.hooksPath 가 이미 $cur 다. 덮으면 그쪽 훅이 안 돈다 (husky 면 npm install 때 되돌린다)."
  if [ "$force" -ne 1 ]; then
    echo "   알고 덮으려면 --force 를 붙여 다시 돌린다."
    exit 1
  fi
  echo "   --force 라서 덮는다."
fi

# ---------------------------------------------------------------------------
# 2) 줄바꿈(CRLF) 교정
# ---------------------------------------------------------------------------
# .gitattributes 를 넣어도 이미 CRLF 로 받아버린 사람은 여전히 깨진다.
# 증상이 `$'\r': command not found` 라 원인을 찾기 어려워서 여기서 한 번 더 잡는다.
# grep 은 Git Bash 에서 줄 끝 CR 을 못 보고 sed -i 는 macOS 에서 문법이 달라서 tr · cmp 로 한다.
fixed=0
for f in "$HOOKDIR"/*; do
  [ -f "$f" ] || continue
  case "$f" in *.ps1) continue ;; esac   # PowerShell 은 CRLF 가 정상
  tr -d '\r' < "$f" | cmp -s - "$f" && continue
  # cat > 로 덮어써야 파일 권한이 그대로 남는다
  if tr -d '\r' < "$f" > "$f.lf" && cat "$f.lf" > "$f" && rm -f "$f.lf" \
     && tr -d '\r' < "$f" | cmp -s - "$f"; then
    echo "   줄바꿈 교정: $f"
    fixed=1
  else
    rm -f "$f.lf"
    echo "!! 줄바꿈 교정 실패: $f"
    exit 1
  fi
done
[ "$fixed" -eq 0 ] && echo "   줄바꿈: 이상 없음"

# ---------------------------------------------------------------------------
# 3) 실행 권한 + 배선
# ---------------------------------------------------------------------------
for f in "$HOOKDIR"/*; do
  [ -f "$f" ] || continue
  case "$f" in *.ps1) continue ;; esac
  chmod +x "$f" 2>/dev/null || true
done
git config core.hooksPath "$HOOKDIR"

# ---------------------------------------------------------------------------
# 4) 확인 — 설정만 하고 끝내지 않는다
# ---------------------------------------------------------------------------
got="$(git config core.hooksPath || true)"
if [ "$got" != "$HOOKDIR" ]; then
  echo "!! 배선 실패 (core.hooksPath='$got')"
  exit 1
fi
if [ ! -f "$HOOKDIR/pre-commit" ]; then
  echo "!! $HOOKDIR/pre-commit 가 없다 — 커밋 게이트가 안 걸린다."
  exit 1
fi
# git 은 실행 권한이 없는 훅을 경고 한 줄만 찍고 건너뛴다
for h in pre-commit commit-msg; do
  if [ -f "$HOOKDIR/$h" ] && [ ! -x "$HOOKDIR/$h" ]; then
    echo "!! $HOOKDIR/$h 에 실행 권한을 못 줬다 — git 이 이 훅을 건너뛴다."
    exit 1
  fi
done

# chmod 는 이 PC 만 고친다. Windows 에서 커밋하면 실행 비트가 git 에 안 실려서
# 맥 · 리눅스에서 받은 사람 쪽에서는 git 이 훅을 무시한다.
if git ls-files -s -- "$HOOKDIR/pre-commit" "$HOOKDIR/commit-msg" | grep -q '^100644'; then
  echo ""
  echo "⚠️  git 에 훅의 실행 비트가 기록돼 있지 않다 — 맥 · 리눅스 팀원은 받은 뒤 훅이 꺼진다."
  echo "   git add --chmod=+x $HOOKDIR/pre-commit $HOOKDIR/commit-msg $HOOKDIR/*.sh 뒤 커밋할 것."
fi

echo ""
echo "설치 완료."
echo "   core.hooksPath = $got"
echo ""
echo "확인해 보려면:"
echo "   git commit --allow-empty -m \" \""
echo "   → 「커밋 전 게이트」가 찍히고 empty commit message 로 멈추면 훅이 걸렸다. 커밋은 남지 않는다."
echo "     아무것도 안 뜨면 설치가 안 됐다."
echo ""
echo "해제:  git config --unset core.hooksPath"
