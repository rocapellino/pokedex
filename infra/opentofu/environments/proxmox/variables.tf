# ==============================================================================
# Variables - Proxmox VE (Endurecido y Parametrizado)
# ==============================================================================
variable "proxmox_endpoint" {
  type        = string
  description = "URL HTTPS de la API de Proxmox VE (ej: https://pve.internal.lan:8006/)"
}

variable "proxmox_api_token" {
  type        = string
  sensitive   = true
  description = "Token de API en formato USER@REALM!TOKENID=UUID"
}

variable "node_name" {
  type        = string
  default     = "pve"
  description = "Nombre del nodo Proxmox donde desplegar los recursos"
}

variable "vm_count" {
  type        = number
  default     = 3
  description = "Cantidad de nodos para el clúster de Kubernetes en Proxmox"
}

variable "ssh_public_key" {
  type        = string
  description = "Clave pública SSH obligatoria para inyectar en las instancias creadas en Proxmox (sin valor predeterminado)"

  validation {
    condition     = can(regex("^(ssh-rsa|ssh-ed25519|ecdsa-)", var.ssh_public_key))
    error_message = "La variable ssh_public_key debe ser una clave pública SSH válida que comience con ssh-ed25519, ssh-rsa o ecdsa-."
  }
}

variable "network_bridge" {
  type        = string
  default     = "vmbr0"
  description = "Bridge de red en el nodo Proxmox (ej: vmbr0)"
}

variable "network_base_ip" {
  type        = string
  default     = "192.168.1."
  description = "Prefijo base de direccionamiento IPv4 para los nodos"
}

variable "network_cidr_mask" {
  type        = string
  default     = "/24"
  description = "Máscara de subred en formato CIDR"
}

variable "network_gateway" {
  type        = string
  default     = "192.168.1.1"
  description = "Dirección IPv4 del Gateway de la subred"
}

variable "proxmox_insecure" {
  type        = bool
  default     = false
  description = "Permitir certificados TLS autofirmados o no confiables al conectar con la API de Proxmox VE (establecer en false para producción)"
}
