# ==============================================================================
# Provisión en Proxmox VE con OpenTofu: K3s en LXC para Pre-Prod (ADR-030)
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Nodo Kubernetes de Pre-Prod: Contenedor LXC Ultraliviano
# ------------------------------------------------------------------------------
resource "proxmox_download_file" "debian_lxc_template" {
  count              = 1
  content_type       = "vztmpl"
  datastore_id       = "local"
  node_name          = var.node_name
  url                = var.lxc_template_url
  file_name          = var.lxc_template_file_name
  checksum           = var.lxc_template_checksum
  checksum_algorithm = var.lxc_template_checksum_algorithm
}

resource "proxmox_virtual_environment_container" "k8s_nodes" {
  count       = var.vm_count
  node_name   = var.node_name
  vm_id       = 800 + count.index
  description = "Nodo Kubernetes (k3s) en Contenedor LXC [Pre-Prod] (OpenTofu Managed)"
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
      # INFRA-003: los contenedores LXC de Proxmox SOLO admiten claves SSH para
      # la cuenta `root`; el provider no expone `username` en este bloque (la
      # documentacion de `proxmox_virtual_environment_container` lo especifica
      # como "the SSH keys for the root account"). Por eso OpenTofu no declara
      # aqui ningun usuario privilegiado y Ansible conecta como `root`,
      # declarando `ansible_user: root` en el inventario.
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
      operating_system[0].template_file_id,
    ]
  }
}

# ------------------------------------------------------------------------------
# 2. HashiCorp Vault (Community Edition) - Contenedor LXC Dedicado
# ------------------------------------------------------------------------------
resource "proxmox_virtual_environment_container" "vault" {
  count       = var.vault_enabled ? 1 : 0
  node_name   = var.node_name
  vm_id       = var.vault_vm_id
  description = "HashiCorp Vault (Community Edition) en Contenedor LXC (OpenTofu Managed)"
  tags        = ["vault", "security", "lxc", "onprem", "pokedex", var.environment_tier]

  unprivileged  = var.vault_unprivileged
  started       = true
  start_on_boot = true

  cpu {
    cores        = var.vault_cores
    architecture = "amd64"
  }

  memory {
    dedicated = var.vault_memory
    swap      = 512
  }

  disk {
    datastore_id = "local-lvm"
    size         = var.vault_disk_size
  }

  operating_system {
    template_file_id = proxmox_download_file.debian_lxc_template[0].id
    type             = "debian"
  }

  network_interface {
    name     = "eth0"
    bridge   = var.network_bridge
    firewall = true
  }

  initialization {
    hostname = var.vault_hostname
    dns {
      servers = [var.network_gateway, "1.1.1.1"]
    }
    ip_config {
      ipv4 {
        address = var.vault_network_ip
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
      operating_system[0].template_file_id,
    ]
  }
}

# ------------------------------------------------------------------------------
# 3. Bastion Host y Nodo de Automatización Centralizado - Contenedor LXC Dedicado
# ------------------------------------------------------------------------------
moved {
  from = proxmox_virtual_environment_container.ansible_satellite
  to   = proxmox_virtual_environment_container.bastion
}

resource "proxmox_virtual_environment_container" "bastion" {
  count       = var.bastion_enabled ? 1 : 0
  node_name   = var.node_name
  vm_id       = var.bastion_vm_id
  description = "Bastion Host y Nodo de Automatización Centralizado en LXC (OpenTofu Managed)"
  tags        = ["bastion", "management", "devops", "lxc", "onprem", "pokedex", var.environment_tier]

  unprivileged  = var.bastion_unprivileged
  started       = true
  start_on_boot = true

  cpu {
    cores        = var.bastion_cores
    architecture = "amd64"
  }

  memory {
    dedicated = var.bastion_memory
    swap      = 512
  }

  disk {
    datastore_id = "local-lvm"
    size         = var.bastion_disk_size
  }

  operating_system {
    template_file_id = proxmox_download_file.debian_lxc_template[0].id
    type             = "debian"
  }

  network_interface {
    name     = "eth0"
    bridge   = var.network_bridge
    firewall = true
  }

  initialization {
    hostname = var.bastion_hostname
    dns {
      servers = [var.network_gateway, "1.1.1.1"]
    }
    ip_config {
      ipv4 {
        address = var.bastion_network_ip
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
      operating_system[0].template_file_id,
    ]
  }
}
