output "container_id" {
  description = "ID del contenedor LXC en Proxmox"
  value       = proxmox_virtual_environment_container.pokedex_lxc.vm_id
}

output "hostname" {
  description = "Hostname de la instancia"
  value       = proxmox_virtual_environment_container.pokedex_lxc.initialization[0].hostname
}
