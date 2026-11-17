output "control_plane_public_ip" {
  description = "관리 서버 고정 공인 IP"
  value       = aws_eip.control_plane.public_ip
}

output "control_plane_instance_id" {
  description = "관리 서버 인스턴스 ID"
  value       = aws_instance.control_plane.id
}

output "ssh_command" {
  description = "관리 서버 접속 명령"
  value       = "ssh ubuntu@${aws_eip.control_plane.public_ip}"
}

output "pg_backup_bucket" {
  description = "PostgreSQL 주간 백업 버킷 — 봉인할 때(seal-secrets.sh pg-backup-s3) · 받을 때 쓴다"
  value       = aws_s3_bucket.pg_backup.bucket
}
