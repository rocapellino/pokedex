variable "project_name" {
  description = "Nombre del proyecto"
  type        = string
  default     = "pokedex"
}

variable "environment" {
  description = "Ambiente de ejecución"
  type        = string
  default     = "dev"
}

variable "resource_group_name" {
  description = "Nombre del Resource Group"
  type        = string
}

variable "location" {
  description = "Región de Azure"
  type        = string
}

variable "infrastructure_subnet_id" {
  description = "ID de la subred para el Container App Environment"
  type        = string
}

variable "container_image" {
  description = "Imagen Docker del backend FastAPI"
  type        = string
  default     = "mcr.microsoft.com/azuredocs/aci-helloworld:latest"
}

variable "database_url" {
  description = "Cadena de conexión de PostgreSQL"
  type        = string
  sensitive   = true
}

variable "redis_url" {
  description = "Cadena de conexión a Redis"
  type        = string
}

variable "cors_origins" {
  description = "Orígenes permitidos para CORS"
  type        = string
  default     = "http://localhost:3000,http://localhost:8080"
}
