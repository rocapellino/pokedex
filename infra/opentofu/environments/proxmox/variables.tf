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
