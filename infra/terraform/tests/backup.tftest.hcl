# 가짜 provider 로 돈다 — AWS 자격 증명 없이 커밋 게이트에서 백업 버킷 설정을 검사한다 (Jira S15P31A102-109)
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

run "백업_버킷은_밖에_열리지_않는다" {
  command = plan

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.pg_backup.block_public_acls,
      aws_s3_bucket_public_access_block.pg_backup.block_public_policy,
      aws_s3_bucket_public_access_block.pg_backup.ignore_public_acls,
      aws_s3_bucket_public_access_block.pg_backup.restrict_public_buckets,
    ])
    error_message = "백업에 회원 정보가 들어 있다 — 공개 막기 네 가지를 모두 켠다"
  }
}

run "백업은_35일_뒤_지운다" {
  command = plan

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.pg_backup.rule[0].status == "Enabled"
    error_message = "수명 규칙이 켜져 있어야 한다"
  }

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.pg_backup.rule[0].filter[0].prefix == "postgres/"
    error_message = "수명 규칙은 postgres/ 아래 백업에만 건다"
  }

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.pg_backup.rule[0].expiration[0].days == 35
    error_message = "주간 백업은 35일(약 5주) 남긴다 — 발표(11-18) 뒤까지 덮는다"
  }
}

run "destroy_를_잘못_해도_백업은_남는다" {
  command = plan

  assert {
    condition     = aws_s3_bucket.pg_backup.force_destroy == false
    error_message = "force_destroy 를 켜면 terraform destroy 가 안의 백업까지 지운다"
  }
}

run "버킷_이름은_apply_정책이_허용한_모양만" {
  command = plan

  variables {
    backup_bucket_name = "my-random-bucket"
  }

  expect_failures = [var.backup_bucket_name]
}
