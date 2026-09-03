variable "project_name" {
  type    = string
  default = "pokedex"
}

variable "environment" {
  type = string
}

variable "vpc_id" {
  description = "ID de la VPC para conectar Cloud SQL y Redis en modo privado"
  type        = string
}

variable "db_tier" {
  description = "Tipo de máquina para Cloud SQL PostgreSQL"
  type        = string
  default     = "db-custom-2-7680"
}

variable "db_password" {
  description = "Contraseña maestra de PostgreSQL"
  type        = string
  sensitive   = true
}

variable "redis_memory_size_gb" {
  description = "Capacidad en GB de Cloud Memorystore Redis"
  type        = number
  default     = 1
}

variable "enable_high_availability" {
  description = "Habilitar replicación síncrona multi-AZ para producción"
  type        = bool
  default     = false
}
