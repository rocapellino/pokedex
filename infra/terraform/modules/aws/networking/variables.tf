variable "project_name" {
  description = "Nombre base del proyecto"
  type        = string
  default     = "pokedex"
}

variable "environment" {
  description = "Entorno de despliegue (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "vpc_cidr" {
  description = "Bloque CIDR de la VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Zonas de disponibilidad para alta disponibilidad"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}
