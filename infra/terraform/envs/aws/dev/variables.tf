variable "project_name" {
  description = "Nombre del proyecto"
  type        = string
  default     = "pokedex"
}

variable "environment" {
  description = "Entorno de despliegue"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "Región de AWS para el despliegue"
  type        = string
  default     = "us-east-1"
}

variable "db_password" {
  description = "Contraseña de PostgreSQL RDS"
  type        = string
  sensitive   = true
}

variable "container_image" {
  description = "URI de la imagen Docker en ECR o Docker Hub"
  type        = string
  default     = "public.ecr.aws/docker/library/python:3.13-slim"
}
