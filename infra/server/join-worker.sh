#!/usr/bin/env bash
# 워커(Lightsail)를 클러스터에 붙인다 — Lightsail 받는 날, common.sh · wg-up.sh worker 다음에
# 컨트롤 플레인에서 찍은 join 명령의 토큰 · CA 해시로 join.yaml 사본을 채워 kubeadm join 한다
#
# 쓰는 법 (순서는 infra/server/README.md)
#   EC2:       sudo kubeadm token create --print-join-command
#   Lightsail: sudo bash infra/server/join-worker.sh <찍힌 줄 전체를 그대로 붙인다>
#              sudo bash infra/server/join-worker.sh --token <토큰> --discovery-token-ca-cert-hash sha256:<해시>
# 토큰은 24시간 뒤 사라진다. 지났으면 EC2 에서 다시 찍는다
set -euo pipefail

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOIN_YAML="$SERVER_DIR/../k8s/kubeadm/join.yaml"
SELF=10.200.0.2
API=10.200.0.1:6443

log() { printf '\n== %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "❌ root 로 돌린다 — sudo bash $0 …" >&2; exit 1; }
command -v kubeadm >/dev/null || { echo "❌ kubeadm 이 없다 — infra/server/common.sh 를 먼저 돌린다" >&2; exit 1; }

# 찍힌 join 명령 전체를 받아도 되고 두 옵션만 받아도 된다 — 나머지 낱말(kubeadm join 주소)은 넘긴다
TOKEN=""
CA_HASH=""
while [ $# -gt 0 ]; do
  case "$1" in
    --token) TOKEN="${2:-}"; shift $(($# >= 2 ? 2 : 1)) ;;
    --discovery-token-ca-cert-hash) CA_HASH="${2:-}"; shift $(($# >= 2 ? 2 : 1)) ;;
    *) shift ;;
  esac
done
[[ "$TOKEN" =~ ^[a-z0-9]{6}\.[a-z0-9]{16}$ ]] || { echo "❌ --token 이 없거나 모양이 다르다 (abcdef.0123456789abcdef 꼴)" >&2; exit 2; }
[[ "$CA_HASH" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo "❌ --discovery-token-ca-cert-hash 가 없거나 모양이 다르다 (sha256:<64자>)" >&2; exit 2; }

log "1/3 터널 확인"
ip -4 -o address show dev wg0 2>/dev/null | grep -q " $SELF/" \
  || { echo "❌ wg0 에 $SELF 이 없다 — sudo bash infra/server/wg-up.sh worker … 를 먼저 돌린다" >&2; exit 1; }
# API 서버가 터널 너머로 닿는지 먼저 본다 — 안 닿으면 join 이 5분 기다린 뒤에야 실패한다
if ! timeout 5 bash -c "</dev/tcp/${API%:*}/${API#*:}" 2>/dev/null; then
  echo "❌ $API 에 닿지 않는다 — wg show 의 latest handshake 와 EC2 보안 그룹(51820/udp)을 본다" >&2
  exit 1
fi
echo "$API 에 닿는다"

log "2/3 kubeadm join"
if [ -f /etc/kubernetes/kubelet.conf ]; then
  echo "이미 join 했다 (/etc/kubernetes/kubelet.conf 있음) — 건너뛴다. 다시 하려면 kubeadm reset"
else
  # 토큰이 든 사본은 root 만 읽게 만들고 끝나면 지운다
  cfg="$(mktemp)"
  trap 'rm -f "$cfg"' EXIT
  chmod 0600 "$cfg"
  sed -e "s/__TOKEN__/$TOKEN/" -e "s/__CA_CERT_HASH__/$CA_HASH/" "$JOIN_YAML" >"$cfg"
  kubeadm config validate --config "$cfg"
  kubeadm join --config "$cfg"
fi

log "3/3 확인"
systemctl is-active kubelet
echo "컨트롤 플레인(EC2)에서 확인한다: kubectl get nodes -o wide  — INTERNAL-IP 가 $SELF 이고 Ready 인지"
