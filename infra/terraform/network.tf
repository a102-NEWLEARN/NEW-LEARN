data "aws_vpc" "default" {
  default = true
}

resource "aws_security_group" "control_plane" {
  name        = "newlearn-control-plane"
  description = "NEW:LEARN kubernetes control plane"
  vpc_id      = data.aws_vpc.default.id

  tags = {
    Name = "newlearn-control-plane"
  }
}

# 관리자는 SSH 로만 들어온다. kubectl 은 SSH 터널로 6443 에 붙는다 — 6443 을 밖에 열지 않는다
resource "aws_vpc_security_group_ingress_rule" "admin_ssh" {
  for_each = toset(var.admin_cidrs)

  security_group_id = aws_security_group.control_plane.id
  description       = "admin ssh"
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
}

# 워커 노드(SSAFY 지급 Lightsail)는 다른 계정이라 사설 IP 로 닿지 않는다. 두 노드를 호스트 WireGuard 로 잇고
# 쿠버네티스 트래픽(6443 · 10250 · Cilium)은 그 터널 안으로만 다닌다. 보안 그룹은 바깥 포장인 WireGuard UDP 만 본다.
# Lightsail 이 먼저 연결하므로 EC2 쪽만 연다 (SSOT.md 6절)
locals {
  wireguard_port = 51820
}

resource "aws_vpc_security_group_ingress_rule" "worker_wireguard" {
  for_each = toset(var.worker_cidrs)

  security_group_id = aws_security_group.control_plane.id
  description       = "worker wireguard"
  cidr_ipv4         = each.value
  ip_protocol       = "udp"
  from_port         = local.wireguard_port
  to_port           = local.wireguard_port
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.control_plane.id
  description       = "all outbound"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
