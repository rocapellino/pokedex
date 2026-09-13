# ==============================================================================
# Módulo OpenTofu: naming - Generación Estandarizada de Nombres de Recursos
# ==============================================================================
locals {
  clean_project     = lower(replace(var.project, "/[^a-zA-Z0-9-]/", ""))
  clean_environment = lower(replace(var.environment, "/[^a-zA-Z0-9-]/", ""))
  clean_service     = lower(replace(var.service, "/[^a-zA-Z0-9-]/", ""))
  clean_region      = lower(replace(var.region, "/[^a-zA-Z0-9-]/", ""))

  prefix = "${local.clean_project}-${local.clean_environment}"
  name   = length(local.clean_region) > 0 ? "${local.prefix}-${local.clean_service}-${local.clean_region}" : "${local.prefix}-${local.clean_service}"
}
