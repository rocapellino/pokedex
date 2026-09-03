# ==============================================================================
# Módulo de Datos para Azure (PostgreSQL Flexible Server + Azure Cache for Redis)
# ==============================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = ">= 3.80.0"
    }
  }
}

# 1. PostgreSQL Flexible Server
resource "azurerm_postgresql_flexible_server" "postgres" {
  name                   = "${var.project_name}-${var.environment}-psql"
  resource_group_name    = var.resource_group_name
  location               = var.location
  version                = "16"
  delegated_subnet_id    = var.database_subnet_id
  administrator_login    = "psqladmin"
  administrator_password = var.db_password
  zone                   = "1"

  storage_mb   = 32768
  sku_name     = var.sku_name

  tags = {
    Environment = var.environment
  }
}

resource "azurerm_postgresql_flexible_server_database" "pokedex_db" {
  name      = "pokedex_db"
  server_id = azurerm_postgresql_flexible_server.postgres.id
  collation = "en_US.utf8"
  charset   = "utf8"
}

# 2. Azure Cache for Redis
resource "azurerm_redis_cache" "redis" {
  name                = "${var.project_name}-${var.environment}-redis"
  location            = var.location
  resource_group_name = var.resource_group_name
  capacity            = 0
  family              = "C"
  sku_name            = "Basic"
  enable_non_ssl_port = false
  minimum_tls_version = "1.2"

  redis_configuration {
    maxmemory_reserved = 10
    maxmemory_delta    = 2
    maxmemory_policy   = "allkeys-lru"
  }

  tags = {
    Environment = var.environment
  }
}
