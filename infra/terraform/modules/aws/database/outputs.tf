output "db_endpoint" {
  description = "Host y puerto de PostgreSQL RDS"
  value       = aws_db_instance.postgres.endpoint
}

output "db_address" {
  description = "Dirección host privada de PostgreSQL"
  value       = aws_db_instance.postgres.address
}

output "db_port" {
  description = "Puerto de PostgreSQL"
  value       = aws_db_instance.postgres.port
}

output "redis_endpoint" {
  description = "Host de conexión para Redis"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "redis_port" {
  description = "Puerto de Redis"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].port
}
