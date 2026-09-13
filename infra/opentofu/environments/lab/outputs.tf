output "node_names" {
  description = "Nombres de los nodos aprovisionados en el entorno de laboratorio"
  value       = proxmox_virtual_environment_vm.lab_k8s_nodes[*].name
}

output "security_baseline_policy" {
  description = "Políticas de seguridad aplicadas al entorno"
  value = {
    backup_retention_days = module.security_baseline.backup_retention_days
    encryption_algorithm  = module.security_baseline.encryption_algorithm
  }
}

output "tags" {
  description = "Etiquetas asignadas al entorno de laboratorio"
  value       = module.tagging.tags
}
