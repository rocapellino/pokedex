# ==============================================================================
# Provisión de Contenedores LXC para Kubernetes en Proxmox VE con OpenTofu
# ==============================================================================

resource "proxmox_download_file" "debian_lxc_template" {
  content_type = "vztmpl"
  datastore_id = "local"
  node_name    = var.node_name
  url          = var.lxc_template_url
  file_name    = var.lxc_template_file_name
}

resource "proxmox_virtual_environment_container" "k8s_nodes" {
  count       = var.vm_count
  node_name   = var.node_name
  vm_id       = 800 + count.index
  description = "Nodo Kubernetes (k3s) en Contenedor LXC para Pokédex Platform (OpenTofu Managed)"
  tags        = ["kubernetes", "lxc", "onprem", "pokedex", "production"]

  unprivileged  = false
  started       = true
  start_on_boot = true

  cpu {
    cores        = var.vm_cores
    architecture = "amd64"
  }

  memory {
    dedicated = var.vm_memory
    swap      = 1024
  }

  disk {
    datastore_id = "local-lvm"
    size         = var.vm_disk_size
  }

  operating_system {
    template_file_id = proxmox_download_file.debian_lxc_template.id
    type             = "debian"
  }

  network_interface {
    name   = "eth0"
    bridge = var.network_bridge
  }

  initialization {
    hostname = var.vm_count == 1 ? "pokedex-k8s-node" : "k8s-node-0${count.index + 1}"
    dns {
      servers = [var.network_gateway, "1.1.1.1"]
    }
    ip_config {
      ipv4 {
        address = var.vm_count == 1 ? var.network_ip : "${var.network_base_ip}${100 + count.index}${var.network_cidr_mask}"
        gateway = var.network_gateway
      }
    }
    user_account {
      keys     = [var.ssh_public_key]
      password = var.vm_user_password
    }
  }

  features {
    nesting = true
  }
}

