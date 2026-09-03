variable "proxmox_api_url" {
  description = "URL de la API de Proxmox VE (ej: https://pve.local:8006/api2/json)"
  type        = string
  default     = "https://192.168.1.100:8006/api2/json"
}

variable "proxmox_api_token_id" {
  description = "ID del Token de la API de Proxmox (ej: root@pam!terraform)"
  type        = string
  default     = "root@pam!terraform"
}

variable "proxmox_api_token_secret" {
  description = "Secret del Token de la API de Proxmox"
  type        = string
  sensitive   = true
}

variable "target_node" {
  description = "Nodo Proxmox de destino"
  type        = string
  default     = "pve"
}

variable "container_vmid" {
  description = "ID numérico para el contenedor LXC"
  type        = number
  default     = 201
}
