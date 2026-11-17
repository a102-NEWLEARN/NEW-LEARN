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

# 올리기 키는 PutObject 가 있어 같은 이름으로 올리면 덮어쓴다 — 버전 관리로 이전 판을 남긴다 (Jira S15P31A102-147)
run "덮어쓰거나_지워도_이전_판이_남는다" {
  command = plan

  assert {
    condition     = aws_s3_bucket_versioning.pg_backup.versioning_configuration[0].status == "Enabled"
    error_message = "버전 관리를 켜야 덮어쓴 · 지운 백업의 이전 판이 남는다"
  }
}

run "이전_판도_35일_뒤_지운다" {
  command = plan

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.pg_backup.rule[0].noncurrent_version_expiration[0].noncurrent_days == 35
    error_message = "이전 판은 35일 뒤 지운다 — 수명 규칙이 없으면 버전 관리 버킷에 판이 쌓인다"
  }

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.pg_backup.rule[1].filter[0].prefix == "postgres/"
    error_message = "삭제 표시 정리 규칙도 postgres/ 아래에만 건다"
  }

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.pg_backup.rule[1].expiration[0].expired_object_delete_marker == true
    error_message = "판이 다 지워진 뒤 남는 삭제 표시를 치운다 — days 와 한 규칙에 둘 수 없어 따로 둔다"
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
