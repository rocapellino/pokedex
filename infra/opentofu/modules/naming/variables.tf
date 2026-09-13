variable "project" {
  type        = string
  description = "Nombre del proyecto raíz (ej. pokedex)"
  default     = "pokedex"
}

variable "environment" {
  type        = string
  description = "Entorno de despliegue (dev, lab, staging, prod)"
}

variable "service" {
  type        = string
  description = "Identificador funcional del servicio o recurso (ej. api, web, db, eks)"
}

variable "region" {
  type        = string
  description = "Identificador geográfico o zona de disponibilidad opcional"
  default     = ""
}
