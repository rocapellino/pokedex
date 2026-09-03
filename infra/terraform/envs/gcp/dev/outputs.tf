output "api_service_url" {
  description = "URL del servicio de API en Cloud Run"
  value       = module.compute.service_uri
}

output "frontend_bucket_url" {
  description = "URL del bucket de frontend"
  value       = "https://storage.googleapis.com/${module.storage.frontend_bucket_name}/index.html"
}

output "database_private_ip" {
  description = "IP privada de Cloud SQL"
  value       = module.database.db_private_ip
}

output "redis_private_ip" {
  description = "IP privada de Redis Memorystore"
  value       = module.database.redis_host
}
