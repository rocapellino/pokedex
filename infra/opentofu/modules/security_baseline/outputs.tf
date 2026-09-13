output "backup_retention_days" {
  description = "Días de retención recomendados para copias de seguridad"
  value       = local.backup_retention_days
}

output "encryption_algorithm" {
  description = "Algoritmo de cifrado estándar en reposo"
  value       = local.encryption_algorithm
}

output "enable_kms_rotation" {
  description = "Indica si la rotación de claves KMS debe estar activa"
  value       = local.enable_kms_rotation
}

output "enforce_ssl_requests" {
  description = "Obliga el uso exclusivo de transporte seguro TLS/HTTPS"
  value       = local.enforce_ssl_requests
}
