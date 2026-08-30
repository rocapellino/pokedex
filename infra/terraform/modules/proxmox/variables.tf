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
  default     = "00000000-0000-0000-0000-000000000000"
}

variable "target_node" {
  description = "Nombre del nodo Proxmox (ej: pve, pve-node1)"
  type        = string
  default     = "pve"
}

variable "container_vmid" {
  description = "ID numérico del contenedor LXC o VM en Proxmox"
  type        = number
  default     = 200
}

variable "hostname" {
  description = "Hostname para la instancia de Pokédex"
  type        = string
  default     = "pokedex-prod"
}

variable "cores" {
  description = "Número de núcleos de CPU asignados"
  type        = number
  default     = 2
}

variable "memory" {
  description = "Memoria RAM en MB"
  type        = number
  default     = 4096
}

variable "disk_size" {
  description = "Tamaño del disco en GB"
  type        = string
  default     = "20G"
}

variable "storage_pool" {
  description = "Pool de almacenamiento de Proxmox (ej: local-lvm, local-zfs, zfs-pool)"
  type        = string
  default     = "local-lvm"
}

variable "ip_address" {
  description = "Dirección IP estática con máscara o 'dhcp' (ej: 192.168.1.200/24)"
  type        = string
  default     = "dhcp"
}

variable "gateway" {
  description = "Gateway por defecto (opcional si se usa DHCP)"
  type        = string
  default     = ""
}

variable "ssh_public_key" {
  description = "Clave pública SSH para acceso root"
  type        = string
  default     = ""
}
