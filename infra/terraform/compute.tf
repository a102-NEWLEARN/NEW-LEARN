data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_key_pair" "admin" {
  key_name   = "newlearn-admin"
  public_key = var.ssh_public_key
}

resource "aws_instance" "control_plane" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.admin.key_name
  vpc_security_group_ids = [aws_security_group.control_plane.id]

  root_block_device {
    volume_type = "gp3"
    volume_size = var.root_volume_gb
    encrypted   = true
  }

  # unlimited — standard 는 크레딧이 바닥나면 기준선(vCPU 당 30%)으로 묶여 CI · 컨트롤 플레인이 느려졌다(7일 steal 평균 7.5% · 최고 29.4%)
  # 기준선을 넘게 쓴 만큼만 vCPU 시간당 USD 0.05. 같은 t3.large 라 SSAFY 승인(EC2 1대) 범위 안 (Jira S15P31A102-149, 10-18 에는 standard 였음)
  credit_specification {
    cpu_credits = "unlimited"
  }

  # 인스턴스 메타데이터는 토큰을 받아야만 읽힌다 (IMDSv2)
  metadata_options {
    http_tokens = "required"
  }

  tags = {
    Name = "newlearn-control-plane"
  }

  lifecycle {
    # 새 Ubuntu 이미지가 나올 때마다 서버를 바꿔 끼우지 않는다. OS 갱신은 서버 안에서 한다
    ignore_changes = [ami]
  }
}

# 컨트롤 플레인 주소는 클러스터 인증서에 들어간다. 껐다 켜도 바뀌지 않게 고정 IP 를 붙인다
resource "aws_eip" "control_plane" {
  domain   = "vpc"
  instance = aws_instance.control_plane.id

  tags = {
    Name = "newlearn-control-plane"
  }
}
