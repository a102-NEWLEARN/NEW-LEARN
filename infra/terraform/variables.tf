variable "region" {
  description = "AWS 리전 (서울)"
  type        = string
  default     = "ap-northeast-2"
}

variable "aws_profile" {
  description = "aws configure --profile 로 만든 프로필 이름 (apply 전용 IAM 사용자 키 — plan 도 이 키로 한다)"
  type        = string
  default     = "newlearn-apply"
}

variable "instance_type" {
  description = "관리 서버(컨트롤 플레인) 사양 (SSOT.md 6절)"
  type        = string
  default     = "t3.large"
}

variable "root_volume_gb" {
  description = "루트 디스크 크기 (GiB)"
  type        = number
  default     = 30
}

variable "ssh_public_key" {
  description = "관리 서버에 넣을 SSH 공개키 (ssh-ed25519 ...)"
  type        = string
}

variable "admin_cidrs" {
  description = "SSH 를 열어 줄 관리자 PC 공인 IP (예: 203.0.113.10/32). IP 가 바뀌면 고치고 다시 apply 한다"
  type        = list(string)

  validation {
    condition     = length(var.admin_cidrs) > 0 && alltrue([for c in var.admin_cidrs : can(cidrnetmask(c)) && c != "0.0.0.0/0"])
    error_message = "관리자 IP 는 하나 이상 넣고, 0.0.0.0/0(전 세계)은 넣지 않는다."
  }
}

variable "worker_cidrs" {
  description = "워커 노드(Lightsail) 공인 IP. 받기 전에는 비워 둔다 — 비어 있으면 WireGuard 포트를 열지 않는다"
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for c in var.worker_cidrs : can(cidrnetmask(c)) && c != "0.0.0.0/0"])
    error_message = "워커 IP 는 CIDR 로 넣고, 0.0.0.0/0(전 세계)은 넣지 않는다."
  }
}

variable "budget_limit_usd" {
  description = "운영 기간 전체 예산 (달러). SSAFY 교보재 승인 금액 — EC2 t3.large 1대 31일, EBS · 공인 IPv4 포함 (SSOT.md 6절)"
  type        = number
  default     = 92.27

  validation {
    condition     = var.budget_limit_usd > 0
    error_message = "예산은 0 보다 커야 한다."
  }
}

variable "budget_start" {
  description = "예산이 비용을 쌓기 시작하는 날 (AWS 형식 YYYY-MM-DD_HH:MM)"
  type        = string
  default     = "2026-10-01_00:00"
}

variable "budget_alert_email" {
  description = "예산 알림을 받을 메일"
  type        = string
}
