# ==============================================================================
# Módulo de Infraestructura para Proxmox VE (LXC / VM con Docker & K8s)
# ==============================================================================

terraform {
  required_providers {
    proxmox = {
      source  = "bpg/proxmox"
      version = ">= 0.60.0"
    }
  }
}

# 1. Contenedor LXC Ligero con soporte para Docker y Anidación (Nesting)
resource "proxmox_virtual_environment_container" "pokedex_lxc" {
  node_name    = var.target_node
  vm_id        = var.container_vmid
  unprivileged = true

  initialization {
    hostname = var.hostname

    ip_config {
      ipv4 {
        address = var.ip_address
        gateway = var.gateway != "" ? var.gateway : null
      }
    }

    user_account {
      keys = var.ssh_public_key != "" ? [var.ssh_public_key] : []
    }
  }

  cpu {
    cores = var.cores
  }

  memory {
    dedicated = var.memory
    swap      = 1024
  }

  disk {
    datastore_id = var.storage_pool
    size         = 20
  }

  features {
    nesting = true
    keyctl  = true
  }

  operating_system {
    template_file_id = "local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst"
    type             = "ubuntu"
  }

  network_interface {
    name   = "eth0"
    bridge = "vmbr0"
  }

  started = true
}
