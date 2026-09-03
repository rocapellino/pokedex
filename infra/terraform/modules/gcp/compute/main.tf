# ==============================================================================
# Módulo de Cómputo Elástico - Cloud Run (FastAPI Serverless Containers)
# ==============================================================================

# 1. Serverless VPC Access Connector (Permite a Cloud Run comunicarse con PostgreSQL y Redis)
resource "google_vpc_access_connector" "connector" {
  name          = "${var.project_name}-${var.environment}-vpc-conn"
  region        = "us-east1"
  ip_cidr_range = "10.8.0.0/28"
  network       = var.vpc_id
}

# 2. Servicio de Contenedor Serverless Cloud Run (FastAPI API Engine)
resource "google_cloud_run_v2_service" "api_service" {
  name     = "${var.project_name}-${var.environment}-api"
  location = "us-east1"
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.container_image

      resources {
        limits = {
          cpu    = "1000m"
          memory = "512Mi"
        }
      }

      env {
        name  = "PORT"
        value = "5000"
      }

      env {
        name  = "DATABASE_URL"
        value = var.database_url
      }

      env {
        name  = "REDIS_URL"
        value = var.redis_url
      }

      env {
        name  = "ENVIRONMENT"
        value = var.environment
      }

      startup_probe {
        http_get {
          path = "/healthz"
          port = 5000
        }
        initial_delay_seconds = 2
        period_seconds        = 5
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/healthz"
          port = 5000
        }
        period_seconds = 10
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}
