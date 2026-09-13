variable "project" {
  type        = string
  description = "Nombre del proyecto raíz"
  default     = "pokedex"
}

variable "environment" {
  type        = string
  description = "Entorno de despliegue (dev, lab, staging, prod)"
}

variable "security_zone" {
  type        = string
  description = "Zona de seguridad arquitectónica (public, internal, restricted, dmz)"
  default     = "internal"
}

variable "owner" {
  type        = string
  description = "Equipo o responsable del recurso"
  default     = "platform-team"
}

variable "custom_tags" {
  type        = map(string)
  description = "Mapa de etiquetas personalizadas adicionales"
  default     = {}
}
