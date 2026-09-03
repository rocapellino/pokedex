output "container_id" {
  description = "ID del contenedor LXC creado"
  value       = module.proxmox_lxc.container_id
}

output "container_ip" {
  description = "Dirección IP asignada al contenedor"
  value       = module.proxmox_lxc.container_ip
}
