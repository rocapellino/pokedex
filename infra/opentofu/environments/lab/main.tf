# ==============================================================================
# Entorno de Laboratorio (Lab) - OpenTofu
# ==============================================================================

module "naming" {
  source      = "../../modules/naming"
  project     = "pokedex"
  environment = "lab"
  service     = "k8s"
}

module "tagging" {
  source        = "../../modules/tagging"
  project       = "pokedex"
  environment   = "lab"
  security_zone = "lab-isolated"
  custom_tags = {
    Tier        = "lab"
    Ephemeral   = "true"
    AutoDestroy = "weekend"
  }
}

module "security_baseline" {
  source             = "../../modules/security_baseline"
  environment        = "lab"
  enable_strict_mode = false
}

resource "proxmox_virtual_environment_vm" "lab_k8s_nodes" {
  count     = var.vm_count
  name      = "${module.naming.name}-node-0${count.index + 1}"
  node_name = var.node_name
  vm_id     = 900 + count.index + 1

  cpu {
    cores = 2
    type  = "host"
  }

  memory {
    dedicated = 2048
  }

  disk {
    datastore_id = "local-lvm"
    file_format  = "raw"
    size         = 20
    interface    = "scsi0"
  }

  network_device {
    bridge = var.network_bridge
    model  = "virtio"
  }

  initialization {
    ip_config {
      ipv4 {
        address = "${var.network_base_ip}${10 + count.index + 1}${var.network_cidr_mask}"
        gateway = var.network_gateway
      }
    }
    user_account {
      username = "devops"
      keys     = [var.ssh_public_key]
    }
  }

  tags = [
    "kubernetes",
    "lab",
    "pokedex",
    "tier-lab"
  ]
}
