# ==============================================================================
# Variables - Proxmox VE (Endurecido y Parametrizado)
# ==============================================================================
variable "proxmox_endpoint" {
  type        = string
  description = "URL HTTPS de la API de Proxmox VE (ej: https://10.10.13.10:8006/)"
}

variable "proxmox_api_token" {
  type        = string
  sensitive   = true
  description = "Token de API de Proxmox VE en formato USER@REALM!TOKENID=UUID (autenticación segura y desacoplada de contraseñas)"

  validation {
    condition     = can(regex(".+@.+!.+=.+", var.proxmox_api_token))
    error_message = "El token de API de Proxmox debe tener el formato USER@REALM!TOKENID=UUID (ej: root@pam!opentofu=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)."
  }
}

variable "node_name" {
  type        = string
  default     = "pve"
  description = "Nombre del nodo Proxmox donde desplegar los recursos"
}

variable "compute_type" {
  type        = string
  default     = "lxc"
  description = "Tipo de cómputo en Proxmox: 'lxc' (ligero para Pre-Prod/Lab) o 'vm' (aislamiento KVM completo para Producción)"

  validation {
    condition     = contains(["lxc", "vm"], var.compute_type)
    error_message = "El valor de compute_type debe ser 'lxc' o 'vm'."
  }
}

variable "environment_tier" {
  type        = string
  default     = "preprod"
  description = "Nivel de entorno: 'preprod' (LXC recomendado) o 'prod' (VM recomendada)"

  validation {
    condition     = contains(["preprod", "prod", "lab"], var.environment_tier)
    error_message = "El valor de environment_tier debe ser 'preprod', 'prod' o 'lab'."
  }
}

variable "vm_image_url" {
  type        = string
  default     = "https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.raw"
  description = "URL oficial de descarga de la imagen Cloud-Init Debian 12 para VMs de Producción"
}

variable "vm_image_file_name" {
  type        = string
  default     = "debian-12-genericcloud-amd64.raw"
  description = "Nombre de archivo de imagen Cloud-Init para VMs"
}

variable "vm_count" {
  type        = number
  default     = 1
  description = "Cantidad de nodos para el clúster de Kubernetes en Proxmox"
}

variable "vm_cores" {
  type        = number
  default     = 4
  description = "Cores de CPU asignados a la VM de Kubernetes"
}

variable "vm_memory" {
  type        = number
  default     = 5120
  description = "Memoria RAM dedicada en MB asignada a la VM"
}

variable "vm_disk_size" {
  type        = number
  default     = 32
  description = "Tamaño del disco en gigabytes para el contenedor o VM"
}

variable "lxc_template_url" {
  type        = string
  default     = "https://mirrors.ustc.edu.cn/proxmox/images/system/debian-12-standard_12.12-1_amd64.tar.zst"
  description = "URL oficial HTTPS de descarga de la plantilla LXC en Proxmox"
}

variable "lxc_template_file_name" {
  type        = string
  default     = "debian-12-standard_12.12-1_amd64.tar.zst"
  description = "Nombre del archivo de plantilla vztmpl en Proxmox"
}

variable "lxc_template_checksum" {
  type        = string
  default     = "ff5c55cba730fc1e93bc7de3e0ea4aecb05c692094009cfcf2999973a56f15e5"
  description = "Hash criptográfico SHA256 oficial para verificación estricta de integridad de la plantilla LXC"
}

variable "lxc_template_checksum_algorithm" {
  type        = string
  default     = "sha256"
  description = "Algoritmo de hash para verificar la plantilla LXC ('sha256' o 'sha512')"
}

variable "image_file_id" {
  type        = string
  default     = "local:vztmpl/debian-12-standard_12.12-1_amd64.tar.zst"
  description = "ID del archivo de plantilla LXC en el storage local de Proxmox"
}


variable "ssh_public_key" {
  type        = string
  description = "Clave pública SSH obligatoria para inyectar en las instancias creadas en Proxmox"

  validation {
    condition     = can(regex("^(ssh-rsa|ssh-ed25519|ecdsa-)", var.ssh_public_key))
    error_message = "La variable ssh_public_key debe ser una clave pública SSH válida que comience con ssh-ed25519, ssh-rsa o ecdsa-."
  }
}

variable "vm_user_password" {
  type        = string
  sensitive   = true
  default     = null
  description = "Contraseña opcional para el usuario de consola (dejar en null para autenticación exclusiva vía SSH Key)"
}

variable "network_bridge" {
  type        = string
  default     = "vmbr0"
  description = "Bridge de red en el nodo Proxmox (ej: vmbr0)"
}

variable "network_ip" {
  type        = string
  default     = "10.10.13.100/24"
  description = "Dirección IPv4 estática CIDR para el nodo principal de Kubernetes"
}

variable "network_gateway" {
  type        = string
  default     = "10.10.13.1"
  description = "Dirección IPv4 del Gateway de la subred"
}

variable "network_base_ip" {
  type        = string
  default     = "10.10.13."
  description = "Prefijo base de direccionamiento IPv4 para clústeres multi-nodo"
}

variable "network_cidr_mask" {
  type        = string
  default     = "/24"
  description = "Máscara de subred en formato CIDR"
}

variable "proxmox_insecure" {
  type        = bool
  default     = false
  description = "Permitir certificados TLS autofirmados al conectar con la API de Proxmox VE (default: false para forzar verificación TLS estricta; activar solo de forma explícita en laboratorios con certificados autofirmados)"
}

