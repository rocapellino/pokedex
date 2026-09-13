# ==============================================================================
# Outputs - Entorno Cloud-Template Neutral
# ==============================================================================
output "cluster_name" {
  description = "Nombre estandarizado generado para el clúster"
  value       = module.naming.name
}

output "node_count" {
  description = "Cantidad de nodos aprovisionados"
  value       = module.compute_cluster.node_count
}

output "node_names" {
  description = "Lista de nombres de los nodos del clúster"
  value       = module.compute_cluster.node_names
}

output "cluster_summary" {
  description = "Resumen de especificaciones de cómputo del clúster"
  value       = module.compute_cluster.spec_summary
}

output "security_posture" {
  description = "Configuración del baseline de seguridad aplicado"
  value = {
    backup_retention_days = module.security_baseline.backup_retention_days
    encryption_algorithm  = module.security_baseline.encryption_algorithm
    enable_kms_rotation   = module.security_baseline.enable_kms_rotation
    enforce_ssl_requests  = module.security_baseline.enforce_ssl_requests
  }
}
