output "api_service_url" {
  description = "URL pública de FastAPI en Azure Container Apps"
  value       = module.compute.api_url
}

output "postgres_fqdn" {
  description = "FQDN del servidor Azure Database for PostgreSQL"
  value       = module.database.db_host
}

output "redis_hostname" {
  description = "Hostname de Azure Cache for Redis"
  value       = module.database.redis_hostname
}

output "storage_account_name" {
  description = "Nombre de la Storage Account para assets"
  value       = module.storage.storage_account_name
}
