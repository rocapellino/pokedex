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

variable "database_subnet_id" {
  description = "ID de la subred delegada para PostgreSQL"
  type        = string
}

variable "db_password" {
  description = "Contraseña de PostgreSQL"
  type        = string
  sensitive   = true
}

variable "sku_name" {
  description = "SKU de PostgreSQL Flexible Server"
  type        = string
  default     = "B_Standard_B1ms"
}
