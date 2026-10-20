#!/usr/bin/env bash
# 워커(Lightsail) 방화벽 — ufw. Lightsail 받는 날 common.sh 다음, wg-up.sh worker · join-worker.sh 전에
# 들이는 것: 22(SSH) · 80 · 443(외부 입구 — Envoy hostPort) · wg0 로 오는 모든 것(컨트롤 플레인의 kubelet · Cilium VXLAN · 헬스 체크)
# 나가는 것은 막지 않는다(ufw 기본값). WireGuard 는 Lightsail 이 먼저 연결하므로 돌아오는 UDP 는 ufw 의 상태 추적이 받는다
# Lightsail 콘솔 방화벽(SSAFY 쪽)은 따로다 — 443 이 거기서도 열려 있는지 받는 날 본다 (SSOT.md 8절)
#
# 쓰는 법 (순서는 infra/server/README.md)
#   sudo bash infra/server/ufw-worker.sh
# 다시 돌려도 된다 — ufw 는 이미 있는 규칙을 건너뛴다. 원래 있던 규칙은 지우지 않는다
set -euo pipefail

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INIT_YAML="$SERVER_DIR/../k8s/kubeadm/init.yaml"

log() { printf '\n== %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "❌ root 로 돌린다 — sudo bash $0" >&2; exit 1; }
command -v ufw >/dev/null || { echo "❌ ufw 가 없다 — sudo apt-get install -y ufw" >&2; exit 1; }

# Pod 주소 범위는 init.yaml 한 곳에만 적는다
POD_CIDR="$(sed -n 's/^ *podSubnet: *//p' "$INIT_YAML")"
[[ "$POD_CIDR" =~ ^[0-9.]+/[0-9]+$ ]] || { echo "❌ $INIT_YAML 에서 podSubnet 을 못 읽었다" >&2; exit 1; }

log "지금 규칙"
ufw status verbose

log "1/4 SSH 를 켜기 전에 연다"
# 켤 때 지금 SSH 가 끊길 수 있다 — ufw(8): 「it may drop existing connections (eg ssh)」
ufw allow 22/tcp

log "2/4 80 · 443 · wg0"
ufw allow 80/tcp
ufw allow 443/tcp
# 노드 사이 쿠버네티스 트래픽은 모두 터널 안으로만 온다. 상대는 컨트롤 플레인 하나(AllowedIPs 10.200.0.1/32)
ufw allow in on wg0

log "3/4 Pod 트래픽 포워딩 ($POD_CIDR)"
# ufw 는 포워딩 기본값이 DROP 이다(/etc/default/ufw 의 DEFAULT_FORWARD_POLICY)
# 우리 Cilium 설정은 eBPF 마스커레이드를 켜지 않아 netfilter 를 건너뛰는 eBPF host routing 이 꺼진다 — Pod 트래픽이 FORWARD 를 지난다
#   https://docs.cilium.io/en/v1.20/operations/performance/tuning/ 「eBPF Host-Routing」 요건
# Cilium 도 FORWARD 맨 앞에 Pod 트래픽을 받는 규칙(CILIUM_FORWARD)을 넣지만(소스 pkg/datapath/iptables) 공식 문서에 없고,
# ufw 를 다시 켤 때 순서가 바뀌는지 확인하지 못했다. 그래서 ufw 쪽에도 Pod 주소 범위만 연다
# 근거: Cilium 을 쓰는 Canonical Kubernetes 의 ufw 안내 — ufw route allow from <Pod 범위> …
#   https://documentation.ubuntu.com/canonical-kubernetes/main/snap/howto/networking/ufw/
# 포워딩 기본값 전체를 ACCEPT 로 바꾸지는 않는다
ufw route allow from "$POD_CIDR"
ufw route allow to "$POD_CIDR"

log "4/4 켜기"
ufw --force enable
# ufw 의 sysctl 파일(/etc/ufw/sysctl.conf)이 IP 포워딩을 끄지 않았는지 본다 — 기본 파일은 그 줄이 주석이다
[ "$(sysctl -n net.ipv4.ip_forward)" = 1 ] || { echo "❌ ufw 를 켠 뒤 net.ipv4.ip_forward 가 1 이 아니다 — /etc/ufw/sysctl.conf 를 본다" >&2; exit 1; }
ufw status verbose
