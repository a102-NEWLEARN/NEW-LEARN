#!/usr/bin/env bash
# 컨트롤 플레인(EC2)에서 클러스터를 만든다 — kubeadm init → kubeconfig → Cilium → CoreDNS Running 까지
# Argo CD 는 깔지 않는다. 워커(Lightsail)가 join 한 뒤에 깐다 — 지금 깔면 컨트롤 플레인에 남는다
# 컨트롤 플레인 taint 는 지우지 않는다. 서비스 Pod 는 워커에만 뜬다 (SSOT.md 6절 「클러스터 구성」)
#
# 쓰는 법 (순서는 infra/server/README.md): common.sh → wg-up.sh control-plane 다음에
#   sudo bash infra/server/init-control-plane.sh
# 다시 돌려도 된다 — 이미 init 했으면 건너뛰고, Cilium 은 같은 값으로 helm upgrade 한다
set -euo pipefail

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SERVER_DIR/../k8s" && pwd)"
INIT_YAML="$K8S_DIR/kubeadm/init.yaml"

# kind 리허설(infra/kind/up.sh)과 같은 판을 쓴다. 올릴 때는 두 곳을 같이 바꾼다
CILIUM_VERSION=1.20.3
# 관리자 PC 와 같은 판 (infra/README.md 「kind 리허설」 도구)
HELM_VERSION=4.3.1
SELF=10.200.0.1
WAIT=10m

log() { printf '\n== %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "❌ root 로 돌린다 — sudo bash $0" >&2; exit 1; }
command -v kubeadm >/dev/null || { echo "❌ kubeadm 이 없다 — infra/server/common.sh 를 먼저 돌린다" >&2; exit 1; }
# advertiseAddress 가 wg0 에 있어야 etcd · API 서버가 뜬다
ip -4 -o address show dev wg0 2>/dev/null | grep -q " $SELF/" \
  || { echo "❌ wg0 에 $SELF 이 없다 — sudo bash infra/server/wg-up.sh control-plane 을 먼저 돌린다" >&2; exit 1; }

want="$(sed -n 's/^kubernetesVersion: *//p' "$INIT_YAML")"
have="$(kubeadm version -o short)"
[ "$want" = "$have" ] || { echo "❌ kubeadm $have 이 init.yaml 의 $want 와 다르다 — common.sh 를 다시 돌린다" >&2; exit 1; }

export KUBECONFIG=/etc/kubernetes/admin.conf

log "1/5 kubeadm init ($have)"
if [ -f "$KUBECONFIG" ]; then
  echo "이미 init 했다 ($KUBECONFIG 있음) — 건너뛴다. 처음부터 다시 하려면 kubeadm reset"
else
  kubeadm config validate --config "$INIT_YAML"
  kubeadm init --config "$INIT_YAML"
fi

log "2/5 kubeconfig (${SUDO_USER:-ubuntu})"
# 공식 안내의 cp · chown 과 같다. 다시 돌리면 덮어쓴다
USER_NAME="${SUDO_USER:-ubuntu}"
USER_HOME="$(getent passwd "$USER_NAME" | cut -d: -f6)"
[ -n "$USER_HOME" ] || { echo "❌ 사용자 $USER_NAME 를 못 찾았다" >&2; exit 1; }
install -d -m 0700 -o "$USER_NAME" -g "$USER_NAME" "$USER_HOME/.kube"
install -m 0600 -o "$USER_NAME" -g "$USER_NAME" "$KUBECONFIG" "$USER_HOME/.kube/config"
echo "$USER_HOME/.kube/config"

log "3/5 Helm $HELM_VERSION"
if [ "$(helm version --template '{{.Version}}' 2>/dev/null || true)" = "v$HELM_VERSION" ]; then
  echo "이미 있다"
else
  [ "$(dpkg --print-architecture)" = amd64 ] || { echo "❌ amd64 만 준비했다" >&2; exit 1; }
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' EXIT
  tarball="helm-v$HELM_VERSION-linux-amd64.tar.gz"
  # 공식 배포처에서 받고 같이 올라온 sha256 으로 확인한다
  curl -fsSL -o "$work/$tarball" "https://get.helm.sh/$tarball"
  curl -fsSL -o "$work/$tarball.sha256sum" "https://get.helm.sh/$tarball.sha256sum"
  (cd "$work" && sha256sum -c "$tarball.sha256sum")
  tar -C "$work" -xzf "$work/$tarball" linux-amd64/helm
  install -m 0755 "$work/linux-amd64/helm" /usr/local/bin/helm
  helm version --template '{{.Version}}'; echo
fi

log "4/5 Cilium $CILIUM_VERSION"
# 공통 값 위에 실제 서버 값(MTU · API 서버 주소 · devices)을 덮는다
helm upgrade --install cilium oci://quay.io/cilium/charts/cilium --version "$CILIUM_VERSION" \
  --namespace kube-system --timeout "$WAIT" \
  -f "$K8S_DIR/bootstrap/cilium-values.yaml" \
  -f "$K8S_DIR/bootstrap/cilium-values.prod.yaml"
kubectl -n kube-system rollout status ds/cilium --timeout="$WAIT"
kubectl -n kube-system rollout status deploy/cilium-operator --timeout="$WAIT"

log "5/5 노드 Ready · CoreDNS"
# CNI 가 뜨기 전에는 노드가 NotReady, CoreDNS 가 Pending 이다
kubectl wait --for=condition=Ready nodes --all --timeout="$WAIT"
kubectl -n kube-system rollout status deploy/coredns --timeout="$WAIT"

log "끝"
kubectl get nodes -o wide
kubectl -n kube-system get pods -o wide
echo
echo "워커를 붙일 때(Lightsail 받는 날) 이 서버에서: sudo kubeadm token create --print-join-command"
