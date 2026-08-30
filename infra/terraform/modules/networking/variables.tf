variable "project_name" {
  description = "Nombre base del proyecto"
  type        = string
  default     = "pokedex"
}

variable "environment" {
  description = "Entorno de despliegue (dev, staging, prod)"
  type        = string
}

variable "vpc_cidr" {
  description = "Rango CIDR principal para la VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Rangos CIDR para las subredes públicas (DMZ)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "app_subnet_cidrs" {
  description = "Rangos CIDR para las subredes privadas de aplicación (FastAPI)"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24"]
}

variable "data_subnet_cidrs" {
  description = "Rangos CIDR para las subredes privadas aisladas de datos (PostgreSQL & Redis)"
  type        = list(string)
  default     = ["10.0.20.0/24", "10.0.21.0/24"]
}

variable "availability_zones" {
  description = "Zonas de disponibilidad para alta redundancia"
  type        = list(string)
  default     = ["us-east1-b", "us-east1-c"]
}
