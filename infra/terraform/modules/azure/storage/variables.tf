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
