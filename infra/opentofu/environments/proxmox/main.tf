# ==============================================================================
# Provisión de Nodos Kubernetes en Proxmox VE con OpenTofu
# ==============================================================================

resource "proxmox_virtual_environment_vm" "k8s_nodes" {
  count     = var.vm_count
  name      = "k8s-node-0${count.index + 1}"
  node_name = var.node_name
  vm_id     = 800 + count.index + 1

  cpu {
    cores = 4
    type  = "host"
  }

  memory {
    dedicated = 4096
  }

  disk {
    datastore_id = "local-lvm"
    file_format  = "raw"
    size         = 32
    interface    = "scsi0"
  }

  network_device {
    bridge = var.network_bridge
    model  = "virtio"
  }

  initialization {
    ip_config {
      ipv4 {
        address = "${var.network_base_ip}${100 + count.index + 1}${var.network_cidr_mask}"
        gateway = var.network_gateway
      }
    }
    user_account {
      username = "devops"
      keys     = [var.ssh_public_key]
    }
  }

  tags = ["kubernetes", "onprem", "pokedex"]
}
