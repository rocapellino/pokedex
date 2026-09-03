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

variable "vpc_id" {
  description = "ID de la VPC donde se desplegarán las bases de datos"
  type        = string
}

variable "subnet_ids" {
  description = "IDs de las subredes privadas para el grupo de base de datos"
  type        = list(string)
}

variable "db_password" {
  description = "Contraseña maestra de PostgreSQL"
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  description = "Tamaño de instancia para RDS PostgreSQL"
  type        = string
  default     = "db.t4g.micro"
}

variable "redis_node_type" {
  description = "Tipo de nodo para ElastiCache Redis"
  type        = string
  default     = "cache.t4g.micro"
}
