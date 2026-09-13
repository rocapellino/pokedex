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
  value       = module.security_baseline.rules
}
