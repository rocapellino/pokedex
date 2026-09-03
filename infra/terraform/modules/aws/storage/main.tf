# ==============================================================================
# Módulo de Almacenamiento Estático para AWS (S3 Bucket & Policies)
# ==============================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0.0"
    }
  }
}

# 1. Bucket S3 para Frontend y Assets Estáticos
resource "aws_s3_bucket" "assets" {
  bucket        = "${var.project_name}-${var.environment}-assets-${formatdate("YYYYMMDD", timestamp())}"
  force_destroy = var.environment == "dev" ? true : false

  tags = {
    Name        = "${var.project_name}-${var.environment}-assets"
    Environment = var.environment
  }

  lifecycle {
    ignore_changes = [bucket]
  }
}

# 2. Bloqueo de Acceso Público Indeseado (Best Practice de Seguridad)
resource "aws_s3_bucket_public_access_block" "assets_block" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 3. Configuración CORS para Web y SPA
resource "aws_s3_bucket_cors_configuration" "assets_cors" {
  bucket = aws_s3_bucket.assets.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["*"]
    max_age_seconds = 3600
  }
}
