output "db_host" {
  description = "FQDN del servidor PostgreSQL Flexible"
  value       = azurerm_postgresql_flexible_server.postgres.fqdn
}

output "db_name" {
  description = "Nombre de la base de datos"
  value       = azurerm_postgresql_flexible_server_database.pokedex_db.name
}

output "redis_hostname" {
  description = "Hostname de Azure Cache for Redis"
  value       = azurerm_redis_cache.redis.hostname
}

output "redis_ssl_port" {
  description = "Puerto SSL de Redis"
  value       = azurerm_redis_cache.redis.ssl_port
}

output "redis_primary_key" {
  description = "Clave primaria de acceso a Redis"
  value       = azurerm_redis_cache.redis.primary_access_key
  sensitive   = true
}
