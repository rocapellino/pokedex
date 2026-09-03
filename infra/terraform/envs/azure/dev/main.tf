# ==============================================================================
# Entorno Dev - Microsoft Azure
# ==============================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.80"
    }
  }
}

provider "azurerm" {
  features {}
}

# 1. Capa de Redes y Aislamiento (Resource Group, VNet y Subnets)
module "networking" {
  source       = "../../../modules/azure/networking"
  project_name = var.project_name
  environment  = var.environment
  location     = var.azure_location
}

# 2. Capa de Datos (Azure PostgreSQL Flexible Server + Azure Cache for Redis)
module "database" {
  source              = "../../../modules/azure/database"
  project_name        = var.project_name
  environment         = var.environment
  resource_group_name = module.networking.resource_group_name
  location            = module.networking.location
  database_subnet_id  = module.networking.database_subnet_id
  db_password         = var.db_password
}

# 3. Capa de Almacenamiento Estático (Storage Account & Blob Container)
module "storage" {
  source              = "../../../modules/azure/storage"
  project_name        = var.project_name
  environment         = var.environment
  resource_group_name = module.networking.resource_group_name
  location            = module.networking.location
}

# 4. Capa de Cómputo Elástico Serverless (Azure Container Apps - ACA)
module "compute" {
  source                   = "../../../modules/azure/compute"
  project_name             = var.project_name
  environment              = var.environment
  resource_group_name      = module.networking.resource_group_name
  location                 = module.networking.location
  infrastructure_subnet_id = module.networking.compute_subnet_id
  container_image          = var.container_image
  database_url             = "postgresql://psqladmin:${var.db_password}@${module.database.db_host}:5432/${module.database.db_name}"
  redis_url                = "rediss://:${module.database.redis_primary_key}@${module.database.redis_hostname}:${module.database.redis_ssl_port}/0"
}
