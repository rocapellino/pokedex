# ==============================================================================
# Variables - Proxmox VE
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
  default     = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGeneratedKeyForCIValidationOnly1234567890 devops@pokedex"
  description = "Clave pública SSH para inyectar en las instancias creadas en Proxmox"
}
