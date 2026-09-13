# ==============================================================================
# Variables - Entorno de Laboratorio (Lab)
# ==============================================================================
variable "proxmox_endpoint" {
  type        = string
  description = "URL HTTPS de la API de Proxmox VE para el clúster de laboratorio"
}

variable "proxmox_api_token" {
  type        = string
  sensitive   = true
  description = "Token de API en formato USER@REALM!TOKENID=UUID"
}

variable "node_name" {
  type        = string
  default     = "pve"
  description = "Nombre del nodo Proxmox asignado a laboratorio"
}

variable "vm_count" {
  type        = number
  default     = 2
  description = "Cantidad reducida de nodos para el clúster de laboratorio"
}

variable "ssh_public_key" {
  type        = string
  description = "Clave pública SSH obligatoria para inyectar en las instancias"

  validation {
    condition     = can(regex("^(ssh-rsa|ssh-ed25519|ecdsa-)", var.ssh_public_key))
    error_message = "La variable ssh_public_key debe ser una clave pública SSH válida (ssh-ed25519, ssh-rsa o ecdsa-)."
  }
}

variable "network_bridge" {
  type        = string
  default     = "vmbr0"
  description = "Bridge de red en el nodo Proxmox"
}

variable "network_base_ip" {
  type        = string
  default     = "10.0.10."
  description = "Prefijo base de direccionamiento IPv4 para el segmento lab"
}

variable "network_cidr_mask" {
  type        = string
  default     = "/24"
  description = "Máscara de subred en formato CIDR"
}

variable "network_gateway" {
  type        = string
  default     = "10.0.10.1"
  description = "Dirección IPv4 del Gateway de la subred lab"
}

variable "proxmox_insecure" {
  type        = bool
  default     = true
  description = "Permitir certificados TLS autofirmados en el entorno de pruebas lab"
}
