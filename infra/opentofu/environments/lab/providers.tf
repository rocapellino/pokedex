# ==============================================================================
# OpenTofu Providers - Laboratorio y Pruebas Efímeras (Lab Environment)
# ==============================================================================
provider "proxmox" {
  endpoint  = var.proxmox_endpoint
  insecure  = var.proxmox_insecure
  api_token = var.proxmox_api_token
}
