variable "project_name" {
  description = "Nombre del proyecto"
  type        = string
  default     = "pokedex"
}

variable "environment" {
  description = "Ambiente de ejecución (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "location" {
  description = "Región de Azure"
  type        = string
  default     = "eastus"
}

variable "vnet_address_space" {
  description = "Espacio de direcciones para la VNet"
  type        = list(string)
  default     = ["10.1.0.0/16"]
}
