# ==============================================================================
# Entorno Dev - Proxmox VE (On-Premises LXC / VM)
# ==============================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    proxmox = {
      source  = "bpg/proxmox"
      version = ">= 0.60.0"
    }
  }
}

provider "proxmox" {
  endpoint = var.proxmox_api_url
  api_token = "${var.proxmox_api_token_id}=${var.proxmox_api_token_secret}"
  insecure  = true
}

module "proxmox_lxc" {
  source                   = "../../../modules/proxmox"
  target_node              = var.target_node
  container_vmid           = var.container_vmid
  hostname                 = "pokedex-dev"
  proxmox_api_token_secret = var.proxmox_api_token_secret
}
