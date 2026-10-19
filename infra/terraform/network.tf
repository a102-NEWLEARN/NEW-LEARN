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

# 워커 노드가 컨트롤 플레인과 주고받는 포트. 워커는 다른 계정(SSAFY 지급 Lightsail)이라 공인 IP 로 붙는다.
# Lightsail 방화벽도 짝을 맞춰 EC2 IP 에서 10250 · 8472/udp · 4240 을 열어야 한다 (SSOT.md 6절)
locals {
  worker_ports = {
    kube-apiserver = { protocol = "tcp", port = 6443 }
    kubelet        = { protocol = "tcp", port = 10250 }
    cilium-health  = { protocol = "tcp", port = 4240 }
    cilium-vxlan   = { protocol = "udp", port = 8472 }
  }
}

resource "aws_vpc_security_group_ingress_rule" "worker" {
  for_each = {
    for pair in setproduct(var.worker_cidrs, keys(local.worker_ports)) : "${pair[1]}-${pair[0]}" => {
      cidr     = pair[0]
      name     = pair[1]
      protocol = local.worker_ports[pair[1]].protocol
      port     = local.worker_ports[pair[1]].port
    }
  }

  security_group_id = aws_security_group.control_plane.id
  description       = "worker ${each.value.name}"
  cidr_ipv4         = each.value.cidr
  ip_protocol       = each.value.protocol
  from_port         = each.value.port
  to_port           = each.value.port
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.control_plane.id
  description       = "all outbound"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
