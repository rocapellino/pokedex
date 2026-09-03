# ==============================================================================
# Módulo de Cómputo Elástico para AWS - App Runner (FastAPI Serverless)
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

# 1. Configuración de Autoescalado
resource "aws_apprunner_auto_scaling_configuration_version" "auto_scaling" {
  auto_scaling_configuration_name = "${var.project_name}-${var.environment}-as"

  max_concurrency = 100
  max_size        = 5
  min_size        = 1

  tags = {
    Name        = "${var.project_name}-${var.environment}-as"
    Environment = var.environment
  }
}

# 2. Servicio Serverless App Runner (Equivalente AWS a Cloud Run)
resource "aws_apprunner_service" "api_service" {
  service_name                   = "${var.project_name}-${var.environment}-api"
  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.auto_scaling.arn

  source_configuration {
    auto_deployments_enabled = false

    image_repository {
      image_identifier      = var.container_image
      image_repository_type = "ECR_PUBLIC"

      image_configuration {
        port = var.container_port

        runtime_environment_variables = {
          ENVIRONMENT  = var.environment
          DATABASE_URL = var.database_url
          REDIS_URL    = var.redis_url
          CORS_ORIGINS = var.cors_origins
        }
      }
    }
  }

  instance_configuration {
    cpu    = var.cpu
    memory = var.memory
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-api"
    Environment = var.environment
  }
}
