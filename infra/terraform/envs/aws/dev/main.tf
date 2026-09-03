# ==============================================================================
# Entorno Dev - Amazon Web Services (AWS)
# ==============================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# 1. Capa de Redes y Aislamiento (VPC y Subnets públicas/privadas)
module "networking" {
  source       = "../../../modules/aws/networking"
  project_name = var.project_name
  environment  = var.environment
}

# 2. Capa de Datos (RDS PostgreSQL + ElastiCache Redis)
module "database" {
  source       = "../../../modules/aws/database"
  project_name = var.project_name
  environment  = var.environment
  vpc_id       = module.networking.vpc_id
  subnet_ids   = module.networking.private_subnet_ids
  db_password  = var.db_password
}

# 3. Capa de Almacenamiento Estático (S3 Bucket)
module "storage" {
  source       = "../../../modules/aws/storage"
  project_name = var.project_name
  environment  = var.environment
}

# 4. Capa de Cómputo Elástico Serverless (AWS App Runner)
module "compute" {
  source          = "../../../modules/aws/compute"
  project_name    = var.project_name
  environment     = var.environment
  container_image = var.container_image
  database_url    = "postgresql://postgres:${var.db_password}@${module.database.db_address}:${module.database.db_port}/pokedex_db"
  redis_url       = "redis://${module.database.redis_endpoint}:${module.database.redis_port}/0"
}
