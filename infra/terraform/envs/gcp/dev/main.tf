terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.20.0"
    }
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.region
}

# 1. Capa de Redes y Aislamiento (DMZ / Zero-Trust)
module "networking" {
  source       = "../../../modules/gcp/networking"
  project_name = var.project_name
  environment  = "dev"
}

# 2. Capa de Datos (Cloud SQL PostgreSQL + Memorystore Redis)
module "database" {
  source                   = "../../../modules/gcp/database"
  project_name             = var.project_name
  environment              = "dev"
  vpc_id                   = module.networking.vpc_id
  db_tier                  = "db-f1-micro"
  db_password              = var.db_password
  redis_memory_size_gb     = 1
  enable_high_availability = false
}

# 3. Capa de Almacenamiento Estático y CDN (Frontend + MinIO Cloud)
module "storage" {
  source       = "../../../modules/gcp/storage"
  project_name = var.project_name
  environment  = "dev"
}

# 4. Capa de Cómputo Elástico Serverless (FastAPI API Engine)
module "compute" {
  source          = "../../../modules/gcp/compute"
  project_name    = var.project_name
  environment     = "dev"
  vpc_id          = module.networking.vpc_id
  container_image = var.container_image
  min_instances   = 0
  max_instances   = 3
  database_url    = "postgresql://postgres:${var.db_password}@${module.database.db_private_ip}:5432/pokedex_db"
  redis_url       = "redis://${module.database.redis_host}:${module.database.redis_port}/0"
}
