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
