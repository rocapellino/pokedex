output "service_url" {
  description = "URL pública del servicio FastAPI en AWS App Runner"
  value       = "https://${aws_apprunner_service.api_service.service_url}"
}

output "service_id" {
  description = "ID del servicio App Runner"
  value       = aws_apprunner_service.api_service.service_id
}

output "service_status" {
  description = "Estado actual del servicio"
  value       = aws_apprunner_service.api_service.status
}
