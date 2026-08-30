variable "gcp_project_id" {
  description = "ID del proyecto en Google Cloud"
  type        = string
  default     = "pokedex-devops-dev"
}

variable "project_name" {
  type    = string
  default = "pokedex"
}

variable "region" {
  type    = string
  default = "us-east1"
}

variable "db_password" {
  description = "Contraseña maestra de PostgreSQL"
  type        = string
  sensitive   = true
  default     = "pokedex_secure_dev_pass_2026"
}

variable "container_image" {
  description = "Imagen del backend FastAPI"
  type        = string
  default     = "gcr.io/pokedex-devops-dev/pokedex-api:latest"
}
