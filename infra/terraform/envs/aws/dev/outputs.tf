output "api_service_url" {
  description = "URL del servicio FastAPI en AWS App Runner"
  value       = module.compute.service_url
}

output "database_endpoint" {
  description = "Endpoint de RDS PostgreSQL"
  value       = module.database.db_endpoint
}

output "redis_endpoint" {
  description = "Endpoint de ElastiCache Redis"
  value       = "${module.database.redis_endpoint}:${module.database.redis_port}"
}

output "s3_bucket_name" {
  description = "Nombre del Bucket S3 de assets"
  value       = module.storage.bucket_id
}
