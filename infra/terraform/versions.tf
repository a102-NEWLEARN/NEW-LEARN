terraform {
  required_version = "~> 1.16.6"

  # 상태 파일은 팀 계정 S3 에 둔다. 버킷 이름 · 프로필은 커밋하지 않는 backend.hcl 에서 받는다 (backend.hcl.example)
  #   terraform init -backend-config=backend.hcl
  # 커밋 검사는 -backend=false 로 init 해서 S3 · 키 없이 돈다
  backend "s3" {}

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.69"
    }
  }
}
