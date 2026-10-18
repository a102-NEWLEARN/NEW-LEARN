#!/usr/bin/env bash
# kind 리허설 클러스터와 로컬 Git 미러 컨테이너를 지운다
# 미러 폴더(infra/kind/.git-mirror, gitignore)는 남긴다 — 다음 up.sh 가 이어 쓴다. 필요 없으면 손으로 지운다
set -euo pipefail
. "$(dirname "$0")/lib.sh"

need kind docker
kind delete cluster --name "$CLUSTER" --kubeconfig "$KUBECONFIG"
docker rm -f "$GIT_CONTAINER" >/dev/null 2>&1 || true
echo "남은 kind 컨테이너: $(docker ps -a --filter "label=io.x-k8s.kind.cluster=$CLUSTER" --format '{{.Names}}' | wc -l)개"
