# PostgreSQL 주간 백업을 두는 S3 버킷 (Jira S15P31A102-109)
# 매일 백업은 관리 서버 디스크에 있다(infra/server/db-backup.md). 여기는 두 서버를 다 잃어도 남는 주간 사본이다
# 올리는 쪽은 올리기만 되는 IAM 사용자 — iam/pg-backup-uploader-policy.json, 사람이 콘솔에서 만든다(infra/README.md)
# 기본 암호화(SSE-S3)는 AWS 가 새 버킷에 늘 건다 — 따로 두지 않는다
resource "aws_s3_bucket" "pg_backup" {
  bucket = var.backup_bucket_name

  # 켜지 않는다 — terraform destroy 를 잘못 해도 안의 백업은 남는다. 정리할 때는 비운 뒤 destroy 한다
  force_destroy = false

  tags = {
    Name = "newlearn-pg-backup"
  }
}

# 백업에 회원 정보가 들어 있다 — 어떤 정책 · ACL 로도 밖에 열리지 않게
resource "aws_s3_bucket_public_access_block" "pg_backup" {
  bucket = aws_s3_bucket.pg_backup.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 주간 백업은 35일(약 5주) 남긴다 — 발표(11-18) 뒤까지 덮는다. 올리는 키는 지울 수 없어 지우기는 이 규칙만 한다
resource "aws_s3_bucket_lifecycle_configuration" "pg_backup" {
  bucket = aws_s3_bucket.pg_backup.id

  rule {
    id     = "expire-postgres-35d"
    status = "Enabled"

    filter {
      prefix = "postgres/"
    }

    expiration {
      days = 35
    }
  }
}
