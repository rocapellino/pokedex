# ==============================================================================
# Outputs - Proxmox VE Kubernetes Node
# ==============================================================================

output "vm_id" {
  description = "ID del Contenedor LXC de Kubernetes en Proxmox"
  value       = proxmox_virtual_environment_container.k8s_nodes[*].vm_id
}

output "vm_name" {
  description = "Hostname asignado al Contenedor LXC"
  value       = [for ct in proxmox_virtual_environment_container.k8s_nodes : ct.initialization[0].hostname]
}

output "vm_ip" {
  description = "Dirección IPv4 configurada en el Contenedor LXC"
  value       = var.network_ip
}
