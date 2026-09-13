variable "environment" {
  type        = string
  description = "Entorno de ejecución (dev, lab, staging, prod)"
}

variable "enable_strict_mode" {
  type        = bool
  description = "Activa restricciones avanzadas de aislamiento de red y cifrado"
  default     = true
}
