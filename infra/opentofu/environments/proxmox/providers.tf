# ==============================================================================
# OpenTofu Providers - Proxmox VE
# ==============================================================================
provider "proxmox" {
  endpoint  = var.proxmox_endpoint
  insecure  = var.proxmox_insecure
  api_token = var.proxmox_api_token
}
