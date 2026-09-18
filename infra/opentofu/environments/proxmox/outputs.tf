# ==============================================================================
# Outputs - Proxmox VE Kubernetes Node (Bi-Modal)
# ==============================================================================

output "instance_id" {
  description = "ID de la instancia (LXC o VM) de Kubernetes en Proxmox"
  value       = var.compute_type == "lxc" ? proxmox_virtual_environment_container.k8s_nodes[*].vm_id : proxmox_virtual_environment_vm.k8s_nodes[*].vm_id
}

output "instance_name" {
  description = "Nombre o hostname asignado a la instancia"
  value       = var.compute_type == "lxc" ? [for ct in proxmox_virtual_environment_container.k8s_nodes : ct.initialization[0].hostname] : proxmox_virtual_environment_vm.k8s_nodes[*].name
}

output "compute_type" {
  description = "Modalidad de cómputo seleccionada ('lxc' para Pre-Prod / 'vm' para Prod)"
  value       = var.compute_type
}

output "environment_tier" {
  description = "Nivel de entorno aprovisionado ('preprod' o 'prod')"
  value       = var.environment_tier
}

output "instance_ip" {
  description = "Dirección IPv4 estática configurada"
  value       = var.network_ip
}

# Compatibilidad con herramientas existentes
output "vm_id" {
  description = "Alias de compatibilidad para ID de instancia"
  value       = var.compute_type == "lxc" ? proxmox_virtual_environment_container.k8s_nodes[*].vm_id : proxmox_virtual_environment_vm.k8s_nodes[*].vm_id
}

output "vm_name" {
  description = "Alias de compatibilidad para nombre de instancia"
  value       = var.compute_type == "lxc" ? [for ct in proxmox_virtual_environment_container.k8s_nodes : ct.initialization[0].hostname] : proxmox_virtual_environment_vm.k8s_nodes[*].name
}

output "vm_ip" {
  description = "Alias de compatibilidad para IP de instancia"
  value       = var.network_ip
}
