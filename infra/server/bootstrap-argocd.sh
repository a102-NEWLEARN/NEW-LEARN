#!/usr/bin/env bash
# 컨트롤 플레인(EC2)에서 Argo CD 를 깔고 루트 Application 을 건다 — 그 뒤는 Argo CD 가 Git 의 infra/k8s/apps 를 따라 깐다
# kind 리허설(infra/kind/up.sh 4~6단계)의 서버판이다. 워커가 join 한 뒤에 돌린다 — 컨트롤 플레인 taint 때문에 Argo CD 는 워커에 뜬다
#
# 쓰는 법 (순서는 infra/server/README.md 「Argo CD 깔기」) — EC2 에서, sudo 없이 (kubeconfig 는 ~/.kube/config)
#   bash infra/server/bootstrap-argocd.sh [브랜치]
# 브랜치 기본값은 dev 다 (SSOT.md 6절 「배포 설정」). 작업 브랜치를 머지 전에 확인할 때만 그 브랜치를 준다
# 처음 한 번은 GitLab 배포 토큰(read_repository)을 묻는다 — 터미널에서 직접 돌린다(ssh -t). 토큰은 화면 · 명령줄에 안 남고 Secret 으로만 들어간다
# 다시 돌려도 된다 — Argo CD 는 같은 값으로 helm upgrade, 저장소 Secret 이 있으면 묻지 않는다, 루트 앱은 브랜치만 바꾼다
set -euo pipefail

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SERVER_DIR/../k8s" && pwd)"

REVISION="${1:-dev}"
REPO_URL=https://lab.ssafy.com/s15-final/S15P31A102.git
REPO_SECRET=repo-newlearn
# kind 리허설(infra/kind/up.sh)과 같은 판. 올릴 때는 두 곳을 같이 바꾼다
ARGOCD_CHART_VERSION=10.10.5 # Argo CD v3.5.5
# Sealed Secrets 컨트롤러와 같은 판 (infra/k8s/apps/templates/sealed-secrets.yaml)
KUBESEAL_VERSION=0.40.0
WAIT=10m

log() { printf '\n== %s\n' "$*"; }

[ "$(id -u)" -ne 0 ] || { echo "❌ sudo 없이 돌린다 — bash $0 $*" >&2; exit 1; }
for c in kubectl helm curl; do
  command -v "$c" >/dev/null || { echo "❌ $c 가 없다 — infra/server/init-control-plane.sh 를 먼저 돌린다" >&2; exit 1; }
done
kubectl get nodes >/dev/null || { echo "❌ kubectl 이 클러스터에 닿지 않는다 (~/.kube/config)" >&2; exit 1; }
workers="$(kubectl get nodes -l '!node-role.kubernetes.io/control-plane' --no-headers 2>/dev/null | awk '$2 == "Ready"' | wc -l)"
[ "$workers" -ge 1 ] || { echo "❌ Ready 인 워커가 없다 — join 을 먼저 한다 (README 「Lightsail (워커)」)" >&2; exit 1; }

log "1/4 Argo CD (차트 $ARGOCD_CHART_VERSION)"
helm upgrade --install argocd argo-cd --repo https://argoproj.github.io/argo-helm \
  --version "$ARGOCD_CHART_VERSION" --namespace argocd --create-namespace --timeout "$WAIT" \
  -f "$K8S_DIR/bootstrap/argocd-values.yaml" \
  -f "$K8S_DIR/bootstrap/argocd-values.prod.yaml"
kubectl -n argocd rollout status deploy/argocd-repo-server --timeout="$WAIT"
kubectl -n argocd rollout status statefulset/argocd-application-controller --timeout="$WAIT"
kubectl -n argocd rollout status deploy/argocd-server --timeout="$WAIT"

log "2/4 저장소 읽기 Secret ($REPO_SECRET)"
if kubectl -n argocd get secret "$REPO_SECRET" >/dev/null 2>&1; then
  echo "있다 — 묻지 않는다. 토큰을 바꿀 때는 kubectl -n argocd delete secret $REPO_SECRET 뒤 다시 돌린다"
else
  [ -t 0 ] || { echo "❌ 배포 토큰을 물어야 한다 — 터미널에서 직접 돌린다 (ssh -t)" >&2; exit 1; }
  echo "GitLab › Settings › Repository › Deploy tokens 에서 만든 read_repository 토큰"
  read -rp "사용자 이름 (gitlab+deploy-token-…): " repo_user
  read -rsp "토큰 (화면에 안 보인다): " repo_token
  echo
  [ -n "$repo_user" ] && [ -n "$repo_token" ] || { echo "❌ 빈 값이다" >&2; exit 1; }
  # 토큰을 명령 인자로 넘기면 ps 에 보인다 — 표준 입력으로 넘긴다
  # apply 가 아니라 create — apply 는 넣은 내용을 주석(last-applied-configuration)에 한 벌 더 남긴다
  kubectl create -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: $REPO_SECRET
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
stringData:
  type: git
  url: "$REPO_URL"
  username: "$repo_user"
  password: "$repo_token"
EOF
  unset repo_token
fi

log "3/4 kubeseal $KUBESEAL_VERSION (Secret 을 봉인하는 도구)"
if kubeseal --version 2>/dev/null | grep -q "$KUBESEAL_VERSION"; then
  echo "이미 있다"
else
  [ "$(dpkg --print-architecture)" = amd64 ] || { echo "❌ amd64 만 준비했다" >&2; exit 1; }
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' EXIT
  base="https://github.com/bitnami-labs/sealed-secrets/releases/download/v$KUBESEAL_VERSION"
  tarball="kubeseal-$KUBESEAL_VERSION-linux-amd64.tar.gz"
  sums="sealed-secrets_${KUBESEAL_VERSION}_checksums.txt"
  # 공식 릴리스에서 받고 같이 올라온 sha256 목록으로 확인한다
  curl -fsSL -o "$work/$tarball" "$base/$tarball"
  curl -fsSL -o "$work/$sums" "$base/$sums"
  (cd "$work" && grep " $tarball\$" "$sums" | sha256sum -c -)
  tar -C "$work" -xzf "$work/$tarball" kubeseal
  sudo install -m 0755 "$work/kubeseal" /usr/local/bin/kubeseal
  kubeseal --version
fi

log "4/4 루트 Application ($REVISION)"
sed -e "s#__REPO_URL__#$REPO_URL#g" -e "s#__REVISION__#$REVISION#g" \
  "$K8S_DIR/bootstrap/root-app.yaml" | kubectl apply -f -

log "앱이 모두 Synced · Healthy 가 되길 기다린다"
# 루트의 건강 상태는 자식 앱의 건강 상태를 모은 것이다 (argocd-values.yaml 의 Application 건강 Lua)
kubectl -n argocd wait application/root --for=jsonpath='{.status.sync.status}'=Synced --timeout="$WAIT"
kubectl -n argocd wait application/root --for=jsonpath='{.status.health.status}'=Healthy --timeout="$WAIT"
kubectl -n argocd get applications

echo
echo "화면 (아직 공개 전): kubectl -n argocd port-forward svc/argocd-server 8080:80 → http://localhost:8080/argocd"
