# ==============================================================================
# Outputs - Proxmox VE Kubernetes Node (LXC Pre-Prod)
# ==============================================================================

output "instance_id" {
  description = "ID del contenedor LXC de Kubernetes en Proxmox"
  value       = proxmox_virtual_environment_container.k8s_nodes[*].vm_id
}

output "instance_name" {
  description = "Nombre o hostname asignado a la instancia"
  value       = [for ct in proxmox_virtual_environment_container.k8s_nodes : ct.initialization[0].hostname]
}

output "environment_tier" {
  description = "Nivel de entorno aprovisionado ('preprod' o 'lab')"
  value       = var.environment_tier
}

output "instance_ip" {
  description = "Dirección IPv4 estática configurada"
  value       = var.network_ip
}

# Compatibilidad con herramientas existentes
output "vm_id" {
  description = "Alias de compatibilidad para ID de instancia"
  value       = proxmox_virtual_environment_container.k8s_nodes[*].vm_id
}

output "vm_name" {
  description = "Alias de compatibilidad para nombre de instancia"
  value       = [for ct in proxmox_virtual_environment_container.k8s_nodes : ct.initialization[0].hostname]
}

output "vm_ip" {
  description = "Alias de compatibilidad para IP de instancia"
  value       = var.network_ip
}

# ==============================================================================
# Outputs - HashiCorp Vault (Community Edition) LXC
# ==============================================================================
output "vault_instance_id" {
  description = "ID del contenedor LXC de HashiCorp Vault en Proxmox VE"
  value       = var.vault_enabled ? proxmox_virtual_environment_container.vault[0].vm_id : null
}

output "vault_hostname" {
  description = "Hostname del contenedor LXC de HashiCorp Vault"
  value       = var.vault_enabled ? proxmox_virtual_environment_container.vault[0].initialization[0].hostname : null
}

output "vault_ip" {
  description = "Dirección IPv4 del contenedor LXC de HashiCorp Vault"
  value       = var.vault_enabled ? split("/", var.vault_network_ip)[0] : null
}

output "vault_endpoint" {
  description = "URL HTTPS del servicio HashiCorp Vault en Proxmox"
  value       = var.vault_enabled ? "https://${split("/", var.vault_network_ip)[0]}:8200" : null
}

# ==============================================================================
# Outputs - Bastion Host y Automatización Centralizada LXC
# ==============================================================================
output "bastion_instance_id" {
  description = "ID del contenedor LXC de bastion en Proxmox VE"
  value       = var.bastion_enabled ? proxmox_virtual_environment_container.bastion[0].vm_id : null
}

output "bastion_hostname" {
  description = "Hostname del contenedor LXC de bastion"
  value       = var.bastion_enabled ? proxmox_virtual_environment_container.bastion[0].initialization[0].hostname : null
}

output "bastion_ip" {
  description = "Dirección IPv4 del contenedor LXC de bastion"
  value       = var.bastion_enabled ? split("/", var.bastion_network_ip)[0] : null
}
