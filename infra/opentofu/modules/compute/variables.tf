# ==============================================================================
# Módulo OpenTofu: compute - Interfaz y Especificación Agnóstica de Nodos
# ==============================================================================
variable "node_count" {
  type        = number
  description = "Cantidad de nodos de cómputo a aprovisionar"
  default     = 1

  validation {
    condition     = var.node_count >= 1 && var.node_count <= 20
    error_message = "El número de nodos de cómputo debe estar entre 1 y 20."
  }
}

variable "node_name_prefix" {
  type        = string
  description = "Prefijo identificador para los nombres de los nodos"
  default     = "pokedex-k8s-node"
}

variable "cpu_cores" {
  type        = number
  description = "Cantidad de vCPUs o cores asignados a cada nodo"
  default     = 2

  validation {
    condition     = var.cpu_cores >= 1 && var.cpu_cores <= 32
    error_message = "La asignación de CPU debe ser de al menos 1 core y máximo 32."
  }
}

variable "memory_mb" {
  type        = number
  description = "Memoria RAM en Megabytes asignada a cada nodo"
  default     = 4096

  validation {
    condition     = var.memory_mb >= 1024
    error_message = "La memoria debe ser de al menos 1024 MB (1 GB)."
  }
}

variable "disk_size_gb" {
  type        = number
  description = "Tamaño del disco principal en Gigabytes"
  default     = 32

  validation {
    condition     = var.disk_size_gb >= 10
    error_message = "El tamaño de disco debe ser de al menos 10 GB."
  }
}

variable "network_id" {
  type        = string
  description = "Identificador de red lógica (bridge para Proxmox / subnet_id o vpc_id para Cloud)"
  default     = "vmbr0"
}

variable "ssh_public_key" {
  type        = string
  description = "Clave pública SSH para aprovisionamiento inicial y acceso seguro"
  default     = ""
}

variable "environment" {
  type        = string
  description = "Entorno de despliegue (dev, lab, staging, prod)"
  default     = "prod"
}

variable "tags" {
  type        = map(string)
  description = "Metadatos y etiquetas para trazabilidad del recurso"
  default     = {}
}
