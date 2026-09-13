# ==============================================================================
# Módulo OpenTofu: security_baseline - Parámetros de Seguridad y Cifrado
# ==============================================================================
locals {
  is_prod = var.environment == "prod" || var.environment == "production"

  backup_retention_days = local.is_prod ? 30 : (var.environment == "lab" ? 7 : 3)
  encryption_algorithm  = "AES256"
  enable_kms_rotation   = true
  enforce_ssl_requests  = true
}
