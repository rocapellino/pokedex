# ==============================================================================
# Módulo OpenTofu: compute - Outputs de la Interfaz Agnóstica
# ==============================================================================
output "node_names" {
  description = "Lista de nombres normalizados asignados a los nodos"
  value       = local.generated_names
}

output "node_count" {
  description = "Cantidad total de nodos configurados"
  value       = var.node_count
}

output "network_id" {
  description = "Identificador de red lógica asociado"
  value       = var.network_id
}

output "spec_summary" {
  description = "Resumen de capacidades de cómputo del grupo de nodos"
  value = {
    node_count      = var.node_count
    cpu_cores_each  = var.cpu_cores
    memory_mb_each  = var.memory_mb
    disk_size_gb    = var.disk_size_gb
    total_vcpus     = local.total_vcpus
    total_memory_gb = local.total_memory_gb
    total_disk_gb   = local.total_disk_gb
    network_id      = var.network_id
    environment     = var.environment
  }
}
