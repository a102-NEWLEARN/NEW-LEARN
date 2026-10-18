# up.sh · sync.sh · down.sh · rehearse-rollout.sh 가 같이 쓰는 값과 검사. 직접 실행하지 않고 source 한다
# shellcheck shell=bash

KIND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$KIND_DIR/../.." && pwd)"
CLUSTER=newlearn
CONTEXT="kind-$CLUSTER"

# 다른 프로젝트 클러스터(~/.kube/config)를 건드리지 않도록 kubeconfig 를 이 파일로만 쓴다
export KUBECONFIG="$KIND_DIR/.kubeconfig"

# cluster.yaml 의 extraPortMappings 와 같은 값
HTTP_URL="http://127.0.0.1:18080/"

# Argo CD 가 읽을 로컬 Git 미러. 팀 GitLab 대신 쓴다 — 배포 토큰도, 원격 브랜치도 필요 없다
MIRROR_DIR="$KIND_DIR/.git-mirror"
GIT_CONTAINER=newlearn-git
REPO_URL="http://$GIT_CONTAINER:8000/cgi-bin/git/newlearn.git"
REVISION=rehearsal

need() {
  local t
  for t in "$@"; do
    command -v "$t" >/dev/null 2>&1 || { echo "❌ $t 가 없다 — infra/README.md 「kind 리허설」의 설치를 먼저 한다" >&2; exit 1; }
  done
}

# 컨텍스트가 kind-newlearn 이 아니면 멈춘다
guard() {
  local now
  now="$(kubectl config current-context 2>/dev/null || true)"
  if [ "$now" != "$CONTEXT" ]; then
    echo "❌ kubectl 컨텍스트가 $CONTEXT 가 아니다 (지금: ${now:-없음}) — 멈춘다" >&2
    exit 1
  fi
}

log() { printf '\n== %s\n' "$*"; }

# 작업 트리의 infra/k8s 를 로컬 Git 미러에 커밋한다 — 커밋 전 매니페스트도 리허설할 수 있다
mirror_push() {
  local work="$MIRROR_DIR/work"
  if [ ! -d "$MIRROR_DIR/newlearn.git" ]; then
    git init -q --bare -b "$REVISION" "$MIRROR_DIR/newlearn.git"
    git -C "$MIRROR_DIR/newlearn.git" config http.receivepack false
  fi
  if [ ! -d "$work/.git" ]; then
    git init -q -b "$REVISION" "$work"
    git -C "$work" remote add origin "$MIRROR_DIR/newlearn.git"
  fi
  # 미러는 받은 파일 그대로(LF) 둔다 — Windows 전역 설정 core.autocrlf 를 따르지 않게
  git -C "$work" config core.autocrlf false
  git -C "$work" rm -r -q --ignore-unmatch infra/k8s
  mkdir -p "$work/infra"
  cp -r "$ROOT/infra/k8s" "$work/infra/"
  git -C "$work" add -A
  if ! git -C "$work" diff --cached --quiet; then
    git -C "$work" -c user.name=kind-rehearsal -c user.email=kind@localhost \
      commit -q -m "infra/k8s 스냅숏 $(date '+%F %T')"
  fi
  git -C "$work" push -q origin "HEAD:refs/heads/$REVISION"
}
