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

variable "container_image" {
  description = "URI de la imagen del contenedor (ECR o Docker Hub)"
  type        = string
  default     = "public.ecr.aws/docker/library/python:3.13-slim"
}

variable "container_port" {
  description = "Puerto expuesto por el contenedor FastAPI"
  type        = string
  default     = "8000"
}

variable "cpu" {
  description = "vCPU asignada al contenedor (1024 = 1 vCPU)"
  type        = string
  default     = "1024"
}

variable "memory" {
  description = "Memoria RAM asignada en MB"
  type        = string
  default     = "2048"
}

variable "database_url" {
  description = "URL de conexión segura a PostgreSQL"
  type        = string
  sensitive   = true
}

variable "redis_url" {
  description = "URL de conexión a Redis"
  type        = string
}

variable "cors_origins" {
  description = "Orígenes permitidos para CORS"
  type        = string
  default     = "http://localhost:3000,http://localhost:8080"
}
