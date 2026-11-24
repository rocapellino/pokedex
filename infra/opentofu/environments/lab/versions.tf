# ==============================================================================
# OpenTofu Versions & Required Providers - Laboratorio y Pruebas Efímeras (Lab)
# ==============================================================================
terraform {
  required_version = ">= 1.8.0"
  required_providers {
    proxmox = {
      source  = "bpg/proxmox"
      version = "~> 0.122.0"
    }
  }
}
