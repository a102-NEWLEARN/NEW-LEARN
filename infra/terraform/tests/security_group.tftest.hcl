# 가짜 provider 로 돈다 — AWS 자격 증명 없이 커밋 게이트에서 보안 그룹 규칙을 검사한다
mock_provider "aws" {
  mock_data "aws_ami" {
    defaults = {
      id = "ami-0123456789abcdef0"
    }
  }

  mock_data "aws_vpc" {
    defaults = {
      id = "vpc-0123456789abcdef0"
    }
  }
}

variables {
  ssh_public_key     = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOnlyForTerraformTestsNotARealKey000000 test"
  admin_cidrs        = ["203.0.113.10/32"]
  budget_alert_email = "alerts@example.com"
  backup_bucket_name = "newlearn-pg-backup-test0000"
}

run "워커_IP_가_없으면_WireGuard_포트를_열지_않는다" {
  command = plan

  # 기본값에 기대지 않는다 — terraform test 는 커밋 안 하는 terraform.tfvars 도 읽어서, 거기 워커 IP 가 있으면 이 시험이 깨진다
  variables {
    worker_cidrs = []
  }

  assert {
    condition     = length(aws_vpc_security_group_ingress_rule.worker_wireguard) == 0
    error_message = "워커 IP 를 넣기 전에는 WireGuard 포트를 열면 안 된다"
  }

  assert {
    condition     = length(aws_vpc_security_group_ingress_rule.admin_ssh) == 1
    error_message = "관리자 IP 하나에 SSH(22) 규칙 하나여야 한다 — 6443 은 SSH 터널로만 쓴다"
  }

  assert {
    condition     = alltrue([for r in aws_vpc_security_group_ingress_rule.admin_ssh : r.cidr_ipv4 == "203.0.113.10/32" && r.from_port == 22])
    error_message = "SSH 는 관리자 IP 에만 열어야 한다"
  }
}

run "워커_IP_에는_WireGuard_UDP_하나만_연다" {
  command = plan

  variables {
    worker_cidrs = ["198.51.100.20/32"]
  }

  assert {
    condition     = length(aws_vpc_security_group_ingress_rule.worker_wireguard) == 1
    error_message = "워커 IP 하나에 규칙 하나(WireGuard)여야 한다 — 쿠버네티스 포트는 터널 안으로만 다닌다"
  }

  assert {
    condition = alltrue([for r in aws_vpc_security_group_ingress_rule.worker_wireguard :
    r.cidr_ipv4 == "198.51.100.20/32" && r.ip_protocol == "udp" && r.from_port == 51820 && r.to_port == 51820])
    error_message = "워커 IP 에서 오는 51820/udp 만 열어야 한다"
  }

  assert {
    condition     = length(aws_vpc_security_group_ingress_rule.admin_ssh) == 1
    error_message = "워커 IP 를 넣어도 들어오는 규칙은 SSH 하나와 WireGuard 하나뿐이어야 한다"
  }
}

run "전_세계에_여는_관리자_IP_는_받지_않는다" {
  command = plan

  variables {
    admin_cidrs = ["0.0.0.0/0"]
  }

  expect_failures = [var.admin_cidrs]
}

run "디스크_암호화_IMDSv2_크레딧_고정" {
  command = plan

  assert {
    condition     = aws_instance.control_plane.root_block_device[0].encrypted == true
    error_message = "루트 디스크는 암호화해야 한다"
  }

  assert {
    condition     = aws_instance.control_plane.metadata_options[0].http_tokens == "required"
    error_message = "인스턴스 메타데이터는 토큰(IMDSv2)으로만 읽혀야 한다"
  }

  assert {
    condition     = aws_instance.control_plane.credit_specification[0].cpu_credits == "standard"
    error_message = "T3 CPU 크레딧은 standard 여야 한다 — unlimited 는 초과 요금이 붙는다"
  }
}

run "예산은_승인_금액을_크레딧_빼기_전으로_잰다" {
  command = plan

  assert {
    condition     = aws_budgets_budget.project_total.limit_amount == "92.27"
    error_message = "예산 기본값은 SSAFY 승인 금액 92.27 달러여야 한다"
  }

  assert {
    condition     = aws_budgets_budget.project_total.cost_types[0].include_credit == false
    error_message = "크레딧이 요금을 덮어도 실제 사용량을 재야 한다"
  }
}
