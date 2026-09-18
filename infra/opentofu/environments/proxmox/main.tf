# ==============================================================================
# Provisión Bi-Modal en Proxmox VE con OpenTofu (Pre-Prod: LXC / Prod: VM)
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Recursos para Entorno Pre-Prod / Lab: Contenedor LXC Ultraliviano
# ------------------------------------------------------------------------------
resource "proxmox_download_file" "debian_lxc_template" {
  count        = var.compute_type == "lxc" ? 1 : 0
  content_type = "vztmpl"
  datastore_id = "local"
  node_name    = var.node_name
  url          = var.lxc_template_url
  file_name    = var.lxc_template_file_name
}

resource "proxmox_virtual_environment_container" "k8s_nodes" {
  count       = var.compute_type == "lxc" ? var.vm_count : 0
  node_name   = var.node_name
  vm_id       = 800 + count.index
  description = "Nodo Kubernetes (k3s) en Contenedor LXC [Pre-Prod/Lab] (OpenTofu Managed)"
  tags        = ["kubernetes", "lxc", "onprem", "pokedex", var.environment_tier]

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
    template_file_id = proxmox_download_file.debian_lxc_template[0].id
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

  lifecycle {
    ignore_changes = [
      initialization[0].user_account[0].password,
    ]
  }
}

# ------------------------------------------------------------------------------
# 2. Recursos para Entorno Producción: Máquina Virtual KVM (Aislamiento Estricto)
# ------------------------------------------------------------------------------
resource "proxmox_download_file" "debian_vm_image" {
  count        = var.compute_type == "vm" ? 1 : 0
  content_type = "import"
  datastore_id = "local"
  node_name    = var.node_name
  url          = var.vm_image_url
  file_name    = var.vm_image_file_name
}

resource "proxmox_virtual_environment_vm" "k8s_nodes" {
  count       = var.compute_type == "vm" ? var.vm_count : 0
  name        = var.vm_count == 1 ? "pokedex-k8s-node" : "k8s-node-0${count.index + 1}"
  description = "Nodo Kubernetes On-Premise [Producción - Aislamiento KVM] (OpenTofu Managed)"
  node_name   = var.node_name
  vm_id       = 800 + count.index

  cpu {
    cores = var.vm_cores
    type  = "host"
  }

  memory {
    dedicated = var.vm_memory
  }

  disk {
    datastore_id = "local-lvm"
    file_format  = "raw"
    size         = var.vm_disk_size
    interface    = "scsi0"
    import_from  = proxmox_download_file.debian_vm_image[0].id
    discard      = "on"
    ssd          = true
    iothread     = true
  }

  boot_order = ["scsi0"]

  operating_system {
    type = "l26"
  }

  agent {
    enabled = true
  }

  serial_device {
    device = "socket"
  }

  network_device {
    bridge = var.network_bridge
    model  = "virtio"
  }

  initialization {
    datastore_id = "local-lvm"
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
      username = "devops"
      password = var.vm_user_password
      keys     = [var.ssh_public_key]
    }
  }

  tags = ["kubernetes", "kvm", "onprem", "pokedex", "production"]

  lifecycle {
    ignore_changes = [
      initialization[0].user_account[0].password,
    ]
  }
}

