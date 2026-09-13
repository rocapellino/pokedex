# ==============================================================================
# Entorno OpenTofu: cloud-template (Plantilla Universal Cloud-Neutral)
# ==============================================================================
# Este entorno define un blueprint genérico para cualquier proveedor de nube
# (AWS, GCP, Azure, Oracle Cloud) consumiendo los contratos desacoplados
# de cómputo, nombres normalizados y baseline de seguridad.
# ==============================================================================

terraform {
  required_version = ">= 1.8.0"
}

module "naming" {
  source = "../../modules/naming"

  project     = var.project
  environment = var.environment
  service     = "compute"
}

module "security_baseline" {
  source = "../../modules/security_baseline"

  environment        = var.environment
  enable_strict_mode = true
}

module "compute_cluster" {
  source = "../../modules/compute"

  node_count       = var.node_count
  node_name_prefix = module.naming.name
  cpu_cores        = var.cpu_cores
  memory_mb        = var.memory_mb
  disk_size_gb     = var.disk_size_gb
  network_id       = var.network_id
  environment      = var.environment
  tags             = var.tags
}
