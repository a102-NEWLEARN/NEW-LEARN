#!/usr/bin/env bash
# kind 리허설 클러스터를 만들고 Cilium → Argo CD → 루트 Application 순서로 올린다
# 그 뒤 Envoy Gateway · Gateway · hello 앱은 Argo CD 가 Git(로컬 미러)에서 가져가 깐다
# 다시 돌려도 된다 — 있는 것은 건너뛰거나 갱신한다
set -euo pipefail

# 2026-10-22 은퇴 — 실제 클러스터가 생겨 앱 목록(infra/k8s/apps)에 cert-manager · 운영 키로 봉인한 Secret · 서비스가 들어갔고
# 시험 앱 hello 는 지웠다(Jira S15P31A102-105). 이 스크립트는 Jira S15P31A102-77 때의 기록으로만 남긴다 (infra/README.md 「kind 리허설」)
echo "❌ kind 리허설은 은퇴했다 (2026-10-22) — 실제 서버에서 확인한다: infra/server/README.md" >&2
exit 1
. "$(dirname "$0")/lib.sh"

CILIUM_VERSION=1.20.3
ARGOCD_CHART_VERSION=10.10.5 # Argo CD v3.5.5
GIT_IMAGE=python:3.12-alpine@sha256:1b668429b3511ab407d8e00648891631b0b1a4d7e15e3ca70f38ab5b91ad4ab4

# 처음에는 노드마다 이미지를 받느라 오래 걸린다 (2026-10-18 이 PC: 노드 이미지만 약 12분)
WAIT=15m

need kind kubectl helm docker git curl
start=$(date +%s)

log "1/6 kind 클러스터"
if kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  echo "이미 있다 — 건너뛴다"
  kind export kubeconfig --name "$CLUSTER" --kubeconfig "$KUBECONFIG"
else
  kind create cluster --config "$KIND_DIR/cluster.yaml" --kubeconfig "$KUBECONFIG"
fi
guard

log "2/6 Cilium $CILIUM_VERSION"
helm upgrade --install cilium oci://quay.io/cilium/charts/cilium --version "$CILIUM_VERSION" \
  --namespace kube-system --timeout "$WAIT" \
  -f "$ROOT/infra/k8s/bootstrap/cilium-values.yaml" \
  -f "$ROOT/infra/k8s/bootstrap/cilium-values.kind.yaml"
kubectl -n kube-system rollout status ds/cilium --timeout="$WAIT"
kubectl -n kube-system rollout status deploy/cilium-operator --timeout="$WAIT"
kubectl wait --for=condition=Ready nodes --all --timeout="$WAIT"

log "3/6 로컬 Git 미러 (infra/k8s 를 담는다)"
mirror_push

if ! docker ps --format '{{.Names}}' | grep -qx "$GIT_CONTAINER"; then
  docker rm -f "$GIT_CONTAINER" >/dev/null 2>&1 || true
  host_dir="$MIRROR_DIR"
  command -v cygpath >/dev/null 2>&1 && host_dir="$(cygpath -w "$MIRROR_DIR")"
  # git http-backend 를 파이썬 CGI 서버로 연다 (Argo CD 는 HTTP 로 읽는다). 읽기 전용
  # Alpine 은 git-http-backend 를 git 이 아니라 git-daemon 패키지에 넣는다
  MSYS_NO_PATHCONV=1 docker run -d --name "$GIT_CONTAINER" --network kind \
    -v "$host_dir:/srv/git:ro" -e GIT_PROJECT_ROOT=/srv/git -e GIT_HTTP_EXPORT_ALL=1 \
    "$GIT_IMAGE" sh -c 'apk add --no-cache git git-daemon >/dev/null &&
      git config --system --add safe.directory "*" &&
      mkdir -p /srv/www/cgi-bin &&
      ln -sf /usr/libexec/git-core/git-http-backend /srv/www/cgi-bin/git &&
      cd /srv/www && exec python -m http.server --cgi 8000' >/dev/null
fi

log "4/6 Argo CD (차트 $ARGOCD_CHART_VERSION)"
helm upgrade --install argocd argo-cd --repo https://argoproj.github.io/argo-helm \
  --version "$ARGOCD_CHART_VERSION" --namespace argocd --create-namespace --timeout "$WAIT" \
  -f "$ROOT/infra/k8s/bootstrap/argocd-values.yaml" \
  -f "$ROOT/infra/k8s/bootstrap/argocd-values.kind.yaml"
kubectl -n argocd rollout status deploy/argocd-repo-server --timeout="$WAIT"
kubectl -n argocd rollout status statefulset/argocd-application-controller --timeout="$WAIT"

log "5/6 루트 Application (app-of-apps)"
sed -e "s#__REPO_URL__#$REPO_URL#g" -e "s#__REVISION__#$REVISION#g" \
  "$ROOT/infra/k8s/bootstrap/root-app.yaml" | kubectl apply -f -

log "6/6 Argo CD 가 앱을 모두 Synced · Healthy 로 만들 때까지 기다린다"
for app in root envoy-gateway gateway hello; do
  for _ in $(seq 1 60); do
    if kubectl -n argocd get application "$app" >/dev/null 2>&1; then break; fi
    sleep 5
  done
  kubectl -n argocd wait "application/$app" --for=jsonpath='{.status.sync.status}'=Synced --timeout="$WAIT"
  kubectl -n argocd wait "application/$app" --for=jsonpath='{.status.health.status}'=Healthy --timeout="$WAIT"
done
kubectl -n argocd get applications

log "확인 — $HTTP_URL 이 hello v1 을 돌려주는가"
got=""
for _ in $(seq 1 30); do
  got="$(curl -sS --max-time 2 "$HTTP_URL" 2>/dev/null | tr -d '\r\n' || true)"
  [ "$got" = "hello v1" ] && break
  sleep 2
done
[ "$got" = "hello v1" ] || { echo "❌ 응답이 hello v1 이 아니다: ${got:-응답 없음}" >&2; exit 1; }
echo "$got"
echo "걸린 시간: $(($(date +%s) - start))초"
