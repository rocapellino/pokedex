# ==============================================================================
# Módulo de Base de Datos y Caché Gestionado - Cloud SQL PostgreSQL + Memorystore Redis
# ==============================================================================

# 1. Instancia Gestionada de Cloud SQL PostgreSQL 16 (Aislamiento Privado Total)
resource "google_sql_database_instance" "postgres" {
  name             = "${var.project_name}-${var.environment}-pg"
  database_version = "POSTGRES_16"
  region           = "us-east1"

  settings {
    tier              = var.db_tier
    availability_type = var.enable_high_availability ? "REGIONAL" : "ZONAL"
    disk_size         = 20
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false  # Cero IP pública (Protección total contra ataques externos)
      private_network = var.vpc_id
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = var.enable_high_availability
      start_time                     = "03:00"
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
    }
  }

  deletion_protection = var.environment == "prod"
}

# 2. Base de Datos Pokédex
resource "google_sql_database" "database" {
  name     = "pokedex_db"
  instance = google_sql_database_instance.postgres.name
}

# 3. Usuario de Aplicación de PostgreSQL
resource "google_sql_user" "db_user" {
  name     = "postgres"
  instance = google_sql_database_instance.postgres.name
  password = var.db_password
}

# 4. Instancia Gestionada de Cloud Memorystore Redis 7 (Caché en Memoria)
resource "google_redis_instance" "redis" {
  name           = "${var.project_name}-${var.environment}-redis"
  tier           = var.enable_high_availability ? "STANDARD_HA" : "BASIC"
  memory_size_gb = var.redis_memory_size_gb
  region         = "us-east1"
  redis_version  = "REDIS_7_0"

  authorized_network = var.vpc_id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  redis_configs = {
    maxmemory-policy = "allkeys-lru"
  }
}
