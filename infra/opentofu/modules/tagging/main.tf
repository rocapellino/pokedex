# ==============================================================================
# Módulo OpenTofu: tagging - Etiquetas Estandarizadas de Gobernanza y Compliance
# ==============================================================================
locals {
  standard_tags = {
    Project      = var.project
    Environment  = var.environment
    ManagedBy    = "OpenTofu"
    SecurityZone = var.security_zone
    Owner        = var.owner
    Repository   = "https://github.com/rocapellino/pokedex"
  }

  merged_tags = merge(local.standard_tags, var.custom_tags)
}
