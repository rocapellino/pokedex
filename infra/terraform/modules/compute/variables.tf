variable "project_name" {
  type    = string
  default = "pokedex"
}

variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "container_image" {
  description = "URI de la imagen Docker de FastAPI en Artifact Registry / ECR"
  type        = string
}

variable "min_instances" {
  description = "Instancias mínimas en ejecución (Warm pool para evitar cold starts)"
  type        = number
  default     = 1
}

variable "max_instances" {
  description = "Límite máximo de autoescalado ante picos de tráfico"
  type        = number
  default     = 10
}

variable "database_url" {
  description = "Cadena de conexión a PostgreSQL"
  type        = string
  sensitive   = true
}

variable "redis_url" {
  description = "Cadena de conexión a Redis"
  type        = string
}
