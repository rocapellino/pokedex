output "db_private_ip" {
  description = "Dirección IP privada de la base de datos PostgreSQL"
  value       = google_sql_database_instance.postgres.private_ip_address
}

output "db_instance_connection_name" {
  description = "Nombre de conexión para Cloud SQL Auth Proxy"
  value       = google_sql_database_instance.postgres.connection_name
}

output "redis_host" {
  description = "Dirección IP privada del clúster de Redis"
  value       = google_redis_instance.redis.host
}

output "redis_port" {
  description = "Puerto de Redis"
  value       = google_redis_instance.redis.port
}
