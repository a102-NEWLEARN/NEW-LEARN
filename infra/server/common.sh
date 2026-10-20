#!/usr/bin/env bash
# 두 노드(EC2 컨트롤 플레인 · Lightsail 워커) 공통 준비 — kubeadm 을 돌리기 전에 노드마다 한 번
# swap 끄기 · 커널 모듈 · IP 포워딩 · containerd 2.x · kubeadm/kubelet/kubectl 고정 · wireguard-tools
# 다시 돌려도 된다 — 같은 값을 다시 쓰고, 바뀐 설정만 다시 읽힌다
#
# 쓰는 법 (순서는 infra/server/README.md)
#   sudo bash infra/server/common.sh
#   sudo bash infra/server/common.sh --packages-only   # 패키지 · 설정 파일만. systemd 가 없는 컨테이너에서 검사할 때
set -euo pipefail

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INIT_YAML="$SERVER_DIR/../k8s/kubeadm/init.yaml"

PACKAGES_ONLY=false
case "${1:-}" in
  "") ;;
  --packages-only) PACKAGES_ONLY=true ;;
  *) echo "❌ 모르는 인자: $1 (쓸 수 있는 것: --packages-only)" >&2; exit 2 ;;
esac

log() { printf '\n== %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "❌ root 로 돌린다 — sudo bash $0" >&2; exit 1; }
# shellcheck source=/dev/null
. /etc/os-release
[ "${VERSION_ID:-}" = "24.04" ] || { echo "❌ Ubuntu 24.04 에서만 확인했다 (지금: ${PRETTY_NAME:-알 수 없음})" >&2; exit 1; }

# 쿠버네티스 판은 init.yaml 한 곳에만 적는다 — 예: v1.36.5 → 패키지 1.36.5-* , 저장소 v1.36
K8S_VERSION="$(sed -n 's/^kubernetesVersion: *v\([0-9][0-9.]*\).*/\1/p' "$INIT_YAML")"
[[ "$K8S_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "❌ $INIT_YAML 에서 kubernetesVersion 을 못 읽었다" >&2; exit 1; }
K8S_MINOR="${K8S_VERSION%.*}"

export DEBIAN_FRONTEND=noninteractive

if ! $PACKAGES_ONLY; then
  log "1/5 swap 끄기"
  # kubelet 은 기본 설정에서 swap 이 켜져 있으면 뜨지 않는다. 재부팅 뒤에도 꺼져 있게 fstab 의 swap 줄을 주석으로 돌린다
  swapoff -a
  sed -ri '/^[^#].*\sswap\s/ s/^/#/' /etc/fstab

  log "2/5 커널 모듈 · IP 포워딩"
  # v1.36 문서가 요구하는 것은 net.ipv4.ip_forward = 1 하나다 — 나머지는 네트워크 플러그인 문서를 보라고 한다
  #   https://v1-36.docs.kubernetes.io/docs/setup/production-environment/container-runtimes/
  # overlay · br_netfilter 는 계획(docs/plans/2026-10-20-pre-server-infra.md)에 있어 같이 올린다. 문서상 필수는 아니다
  cat >/etc/modules-load.d/k8s.conf <<'EOF'
overlay
br_netfilter
EOF
  modprobe overlay
  modprobe br_netfilter
  cat >/etc/sysctl.d/k8s.conf <<'EOF'
net.ipv4.ip_forward = 1
EOF
  sysctl --system >/dev/null
  [ "$(sysctl -n net.ipv4.ip_forward)" = 1 ] || { echo "❌ net.ipv4.ip_forward 가 1 이 아니다 — 다른 sysctl 파일이 덮는지 본다" >&2; exit 1; }
fi

log "3/5 kubeadm · kubelet · kubectl $K8S_VERSION 고정"
# https://v1-36.docs.kubernetes.io/docs/setup/production-environment/tools/kubeadm/install-kubeadm/
apt-get update -q
apt-get install -y -q apt-transport-https ca-certificates curl gpg
install -d -m 0755 /etc/apt/keyrings
curl -fsSL "https://pkgs.k8s.io/core:/stable:/v$K8S_MINOR/deb/Release.key" \
  | gpg --dearmor --yes -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v$K8S_MINOR/deb/ /" \
  >/etc/apt/sources.list.d/kubernetes.list
apt-get update -q

# 이미 다른 판이 깔려 있으면 멈춘다. 돌고 있는 클러스터의 판 올리기는 kubeadm upgrade 절차로 한다
for p in kubeadm kubelet kubectl; do
  have="$(dpkg-query -W -f='${Version}' "$p" 2>/dev/null || true)"
  if [ -n "$have" ] && [[ "$have" != "$K8S_VERSION"-* ]]; then
    echo "❌ $p $have 가 이미 있다 (init.yaml: $K8S_VERSION) — 판 올리기는 kubeadm upgrade 로 한다" >&2
    exit 1
  fi
done
# crictl(cri-tools)은 kubeadm 이 끌어오지 않는다(2026-10-20 EC2 에서 확인) — 같은 저장소에서 같은 minor 판을 따로 깐다
apt-get install -y -q "kubeadm=$K8S_VERSION-*" "kubelet=$K8S_VERSION-*" "kubectl=$K8S_VERSION-*" "cri-tools=$K8S_MINOR.*"
apt-mark hold kubeadm kubelet kubectl cri-tools >/dev/null

log "4/5 containerd 2.x"
# Ubuntu 24.04 저장소의 containerd 를 쓴다 — 2026-10-20 기준 2.2.1 (noble-updates). 다른 저장소를 더하지 않는다
# Docker 저장소의 containerd.io 와 같이 깔 수 없다. Runner 용 Docker 가 필요해지면 그때 다시 본다 (SSOT.md 6절 「관리 서버 주의 — containerd」)
apt-get install -y -q containerd
containerd --version
# 설정은 기본값에서 시작해 두 곳만 바꾼다. 기본값은 CRI 플러그인이 켜져 있다(disabled_plugins = [])
#   - runc 의 SystemdCgroup = true — kubeadm 이 kubelet cgroup 드라이버를 systemd 로 두므로 맞춘다
#     containerd 2.x(설정 version 3)의 자리: [plugins.'io.containerd.cri.v1.runtime'.containerd.runtimes.runc.options]
#     2.0 · 2.1 초기 판은 기본 설정에 이 줄이 없었다(containerd 이슈 #12101). 그래서 바꾼 뒤 줄이 있는지 확인한다
#   - sandbox(pause) 이미지를 kubeadm 이 쓰는 판으로 — 자리: [plugins.'io.containerd.cri.v1.images'.pinned_images]
#     2026-10-20 확인: containerd 2.2.1 기본값 pause:3.10.1, kubeadm 1.36.5 는 pause:3.10.2
PAUSE_IMAGE="$(kubeadm config images list --kubernetes-version "v$K8S_VERSION" 2>/dev/null | grep '/pause:' || true)"
[ -n "$PAUSE_IMAGE" ] || { echo "❌ kubeadm config images list 에서 pause 이미지를 못 찾았다" >&2; exit 1; }
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
containerd config default \
  | sed -e "s/SystemdCgroup = false/SystemdCgroup = true/" \
        -e "s#^\( *sandbox = \)'[^']*'#\1'$PAUSE_IMAGE'#" >"$tmp"
grep -q "SystemdCgroup = true" "$tmp" || { echo "❌ containerd 설정에 SystemdCgroup 자리가 없다 — 판이 바뀌었는지 본다" >&2; exit 1; }
grep -q "sandbox = '$PAUSE_IMAGE'" "$tmp" || { echo "❌ containerd 설정에 sandbox 자리가 없다 — 판이 바뀌었는지 본다" >&2; exit 1; }
install -d -m 0755 /etc/containerd
CONTAINERD_CHANGED=false
if ! cmp -s "$tmp" /etc/containerd/config.toml; then
  [ -f /etc/containerd/config.toml ] && cp /etc/containerd/config.toml "/etc/containerd/config.toml.bak.$(date +%Y%m%d%H%M%S)"
  install -m 0644 "$tmp" /etc/containerd/config.toml
  CONTAINERD_CHANGED=true
fi
# crictl 이 containerd 를 바로 찾게 한다 — 서버에서 crictl ps 로 컨테이너를 본다
echo 'runtime-endpoint: unix:///run/containerd/containerd.sock' >/etc/crictl.yaml

log "5/5 wireguard-tools"
apt-get install -y -q wireguard-tools

if ! $PACKAGES_ONLY; then
  systemctl enable containerd >/dev/null
  if $CONTAINERD_CHANGED; then systemctl restart containerd; else systemctl start containerd; fi
  # kubelet 은 kubeadm init · join 전까지 몇 초마다 다시 뜨며 실패한다. 정상이다
  systemctl enable kubelet >/dev/null
fi

log "끝 — 깔린 판"
dpkg-query -W -f='${Package} ${Version}\n' kubeadm kubelet kubectl cri-tools containerd runc wireguard-tools
apt-mark showhold
echo "sandbox: $PAUSE_IMAGE"
