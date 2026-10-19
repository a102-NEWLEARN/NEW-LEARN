#!/usr/bin/env bash
# infra/k8s 를 고친 뒤 리허설 클러스터에 반영한다 — 로컬 Git 미러에 커밋하고 Argo CD 에 다시 읽으라고 알린다
# 반영은 Argo CD 가 한다(GitOps). 이 스크립트는 kubectl apply 를 하지 않는다
set -euo pipefail
. "$(dirname "$0")/lib.sh"

need kubectl git docker
guard
docker ps --format '{{.Names}}' | grep -qx "$GIT_CONTAINER" ||
  { echo "❌ Git 미러 컨테이너($GIT_CONTAINER)가 꺼져 있다 — bash infra/kind/up.sh 로 다시 띄운다" >&2; exit 1; }
apps="$(kubectl -n argocd get applications -o jsonpath='{.items[*].metadata.name}')"
[ -n "$apps" ] || { echo "❌ Argo CD 앱이 없다 — bash infra/kind/up.sh 를 먼저 돌린다" >&2; exit 1; }

mirror_push
for app in $apps; do
  kubectl -n argocd annotate application "$app" argocd.argoproj.io/refresh=hard --overwrite >/dev/null
done
echo "미러에 올리고 Argo CD 앱 $(echo "$apps" | wc -w)개에 새로고침을 걸었다 — 상태: KUBECONFIG=infra/kind/.kubeconfig kubectl -n argocd get applications"
