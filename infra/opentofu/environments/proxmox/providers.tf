# ==============================================================================
# OpenTofu Providers - Proxmox VE
# ==============================================================================
terraform {
  required_version = ">= 1.8.0"
  required_providers {
    proxmox = {
      source  = "bpg/proxmox"
      version = "~> 0.112.0"
    }
  }
}

provider "proxmox" {
  endpoint = var.proxmox_endpoint
  insecure = var.proxmox_insecure

  username  = var.proxmox_username
  password  = var.proxmox_password
  api_token = var.proxmox_api_token
}
