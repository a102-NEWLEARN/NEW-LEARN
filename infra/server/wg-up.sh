#!/usr/bin/env bash
# 노드 사이 WireGuard(wg0) 를 올린다 — 계정이 다른 EC2 와 Lightsail 을 터널 10.200.0.0/24 로 잇는다
# 설계와 까닭은 SSOT.md 6절 「노드 사이 — 호스트 WireGuard」
#   control-plane (EC2)       10.200.0.1  51820/udp 에서 기다린다
#   worker        (Lightsail) 10.200.0.2  EC2 탄력적 IP 로 먼저 연결하고 25초마다 신호를 보내 길을 유지한다
#
# 쓰는 법 (순서는 infra/server/README.md)
#   sudo bash infra/server/wg-up.sh control-plane [워커 공개키]
#   sudo bash infra/server/wg-up.sh worker <컨트롤 플레인 공개키> <EC2 탄력적 IP>[:51820]
# 인자 대신 환경변수 PEER_PUBLIC_KEY · PEER_ENDPOINT 로 줘도 된다. 줄 때는 sudo 뒤에 쓴다 (sudo PEER_PUBLIC_KEY=… bash …)
#
# 개인키는 이 서버에서 만들고 밖으로 내지 않는다. 화면에는 공개키만 찍는다
# 다시 돌려도 된다 — 키는 그대로 두고, 상대를 안 주면 이미 적힌 상대를 그대로 쓴다
set -euo pipefail

ROLE="${1:-}"
PEER_PUBLIC_KEY="${2:-${PEER_PUBLIC_KEY:-}}"
PEER_ENDPOINT="${3:-${PEER_ENDPOINT:-}}"

PORT=51820
MTU=1420 # EC2 는 점보 프레임(9001)이라 wg-quick 자동값을 믿지 않고 고정한다. Cilium MTU 도 같은 값 (k8s/bootstrap/cilium-values.prod.yaml)
DIR=/etc/wireguard
CONF="$DIR/wg0.conf"
KEY="$DIR/wg0.key"
PUB="$DIR/wg0.pub"

case "$ROLE" in
  control-plane) SELF=10.200.0.1; PEER=10.200.0.2 ;;
  worker) SELF=10.200.0.2; PEER=10.200.0.1 ;;
  *) echo "❌ 역할을 준다: control-plane 또는 worker" >&2; exit 2 ;;
esac

log() { printf '\n== %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "❌ root 로 돌린다 — sudo bash $0 $ROLE …" >&2; exit 1; }
command -v wg >/dev/null || { echo "❌ wg 가 없다 — infra/server/common.sh 를 먼저 돌린다" >&2; exit 1; }

# 상대를 안 주면 지난번에 적은 상대를 그대로 쓴다
if [ -z "$PEER_PUBLIC_KEY" ] && [ -f "$CONF" ]; then
  PEER_PUBLIC_KEY="$(sed -n 's/^PublicKey = //p' "$CONF")"
fi
if [ -z "$PEER_ENDPOINT" ] && [ -f "$CONF" ]; then
  PEER_ENDPOINT="$(sed -n 's/^Endpoint = //p' "$CONF")"
fi

# WireGuard 키는 32바이트를 base64 로 쓴 44글자다
if [ -n "$PEER_PUBLIC_KEY" ] && ! [[ "$PEER_PUBLIC_KEY" =~ ^[A-Za-z0-9+/]{43}=$ ]]; then
  echo "❌ 상대 공개키 모양이 아니다 (base64 44글자): $PEER_PUBLIC_KEY" >&2
  exit 2
fi

if [ "$ROLE" = worker ]; then
  [ -n "$PEER_PUBLIC_KEY" ] && [ -n "$PEER_ENDPOINT" ] \
    || { echo "❌ worker 는 컨트롤 플레인 공개키와 EC2 탄력적 IP 가 있어야 한다" >&2; exit 2; }
  # 포트를 안 적었으면 51820
  [[ "$PEER_ENDPOINT" == *:* ]] || PEER_ENDPOINT="$PEER_ENDPOINT:$PORT"
  [[ "$PEER_ENDPOINT" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}:[0-9]+$ ]] \
    || { echo "❌ EC2 탄력적 IP 는 IPv4 주소[:포트] 로 준다: $PEER_ENDPOINT" >&2; exit 2; }
fi

log "1/4 키"
install -d -m 0700 "$DIR"
if [ ! -s "$KEY" ]; then
  (umask 077 && wg genkey >"$KEY")
  echo "새 키를 만들었다 ($KEY, root 만 읽는다)"
else
  echo "있는 키를 쓴다 ($KEY)"
fi
wg pubkey <"$KEY" >"$PUB"
chmod 0600 "$KEY"
chmod 0644 "$PUB"

log "2/4 $CONF ($ROLE $SELF)"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
chmod 0600 "$tmp"
{
  echo "# infra/server/wg-up.sh 가 만든다 — 손으로 고치지 말고 스크립트를 다시 돌린다"
  echo "[Interface]"
  echo "Address = $SELF/24"
  if [ "$ROLE" = control-plane ]; then echo "ListenPort = $PORT"; fi
  echo "MTU = $MTU"
  echo "PrivateKey = $(cat "$KEY")"
  if [ -n "$PEER_PUBLIC_KEY" ]; then
    echo
    echo "[Peer]"
    echo "PublicKey = $PEER_PUBLIC_KEY"
    # 상대 노드 하나만 터널로 보낸다
    echo "AllowedIPs = $PEER/32"
    if [ "$ROLE" = worker ]; then
      echo "Endpoint = $PEER_ENDPOINT"
      # Lightsail 쪽 방화벽 · NAT 가 길을 닫지 않게 25초마다 빈 신호를 보낸다
      echo "PersistentKeepalive = 25"
    fi
  fi
} >"$tmp"
install -m 0600 "$tmp" "$CONF"
if [ -z "$PEER_PUBLIC_KEY" ]; then
  echo "상대 공개키가 아직 없다 — 터널 주소만 올린다. 상대가 생기면 공개키를 주고 다시 돌린다"
fi

log "3/4 wg-quick@wg0"
systemctl enable wg-quick@wg0 >/dev/null
if ip link show wg0 >/dev/null 2>&1; then
  # 이미 떠 있으면 인터페이스를 내리지 않고 키 · 상대만 바꾼다 — 내리면 터널 주소에 묶인 API 서버 · etcd 가 끊긴다
  wg syncconf wg0 <(wg-quick strip wg0)
  ip link set wg0 mtu "$MTU"
else
  systemctl start wg-quick@wg0
fi

# kubelet 이 재부팅 때 wg0 보다 먼저 뜨면 노드 주소(터널 주소)를 못 찾는다 — 순서를 건다
install -d -m 0755 /etc/systemd/system/kubelet.service.d
cat >/etc/systemd/system/kubelet.service.d/20-wireguard.conf <<'EOF'
# infra/server/wg-up.sh 가 만든다 — 노드 주소가 wg0 에 있어서 wg0 가 뜬 뒤에 kubelet 을 띄운다
[Unit]
Wants=wg-quick@wg0.service
After=wg-quick@wg0.service
EOF
systemctl daemon-reload

log "4/4 확인"
ip -brief address show wg0
echo "mtu $(cat /sys/class/net/wg0/mtu)"
# wg show 는 개인키를 찍지 않는다
wg show wg0
echo
echo "이 노드의 공개키 (상대 노드에 준다): $(cat "$PUB")"
