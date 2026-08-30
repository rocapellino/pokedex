# ==============================================================================
# Módulo de Almacenamiento Estático y CDN - Cloud Storage (GCS / S3) + CDN
# ==============================================================================

# 1. Bucket para el Frontend Web Estático (Reemplazo Serverless de Nginx)
resource "google_storage_bucket" "frontend_bucket" {
  name          = "${var.project_name}-${var.environment}-frontend-assets"
  location      = var.location
  force_destroy = true

  website {
    main_page_suffix = "index.html"
    not_found_page   = "index.html"
  }

  uniform_bucket_level_access = true

  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD"]
    response_header = ["*"]
    max_age_seconds = 3600
  }
}

# 2. Bucket de Almacenamiento de Assets y Backups (Equivalente Cloud de MinIO)
resource "google_storage_bucket" "media_bucket" {
  name          = "${var.project_name}-${var.environment}-media-backups"
  location      = var.location
  force_destroy = true

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }
}

# 3. Backend Bucket para Cloud CDN
resource "google_compute_backend_bucket" "cdn_backend" {
  name        = "${var.project_name}-${var.environment}-cdn-backend"
  bucket_name = google_storage_bucket.frontend_bucket.name
  enable_cdn  = true

  cdn_policy {
    cache_mode        = "CACHE_ALL_STATIC"
    default_ttl       = 3600
    client_ttl        = 3600
    max_ttl           = 86400
    negative_caching  = true
  }
}
