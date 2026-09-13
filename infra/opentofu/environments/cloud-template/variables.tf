# ==============================================================================
# Variables - Entorno Cloud-Template Neutral (OpenTofu)
# ==============================================================================
# Plantilla canónica multi-cloud agnóstica.
# No requiere credenciales de proveedor cloud activas para validarse ni planificarse.
# ==============================================================================

variable "project" {
  type        = string
  default     = "pokedex"
  description = "Nombre del proyecto o plataforma"
}

variable "environment" {
  type        = string
  default     = "cloud-template"
  description = "Identificador del entorno de ejecución"
}

variable "node_count" {
  type        = number
  default     = 3
  description = "Cantidad deseada de nodos para el grupo de cómputo"
}

variable "cpu_cores" {
  type        = number
  default     = 4
  description = "Cantidad de cores/vCPUs asignados por nodo"
}

variable "memory_mb" {
  type        = number
  default     = 8192
  description = "Cantidad de memoria RAM en MB asignada por nodo"
}

variable "disk_size_gb" {
  type        = number
  default     = 50
  description = "Capacidad del disco de almacenamiento en GB por nodo"
}

variable "network_id" {
  type        = string
  default     = "cloud-vpc-subnet-default"
  description = "Identificador lógico de red o subred del proveedor cloud"
}

variable "tags" {
  type        = map(string)
  default = {
    Application = "Pokédex"
    Tier        = "CloudTemplate"
    ManagedBy   = "OpenTofu"
  }
  description = "Etiquetas comunes aplicadas a los recursos"
}
