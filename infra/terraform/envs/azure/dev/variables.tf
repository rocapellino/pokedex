variable "project_name" {
  description = "Nombre del proyecto"
  type        = string
  default     = "pokedex"
}

variable "environment" {
  description = "Entorno de ejecución"
  type        = string
  default     = "dev"
}

variable "azure_location" {
  description = "Región de Azure para el despliegue"
  type        = string
  default     = "eastus"
}

variable "db_password" {
  description = "Contraseña para Azure PostgreSQL Flexible Server"
  type        = string
  sensitive   = true
}

variable "container_image" {
  description = "Imagen Docker para Azure Container Apps"
  type        = string
  default     = "mcr.microsoft.com/azuredocs/aci-helloworld:latest"
}
