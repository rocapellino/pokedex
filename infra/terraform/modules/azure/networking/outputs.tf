output "resource_group_name" {
  description = "Nombre del Resource Group"
  value       = azurerm_resource_group.rg.name
}

output "location" {
  description = "Región del Resource Group"
  value       = azurerm_resource_group.rg.location
}

output "vnet_id" {
  description = "ID de la VNet"
  value       = azurerm_virtual_network.vnet.id
}

output "compute_subnet_id" {
  description = "ID de la subred para contenedores"
  value       = azurerm_subnet.compute_subnet.id
}

output "database_subnet_id" {
  description = "ID de la subred para PostgreSQL"
  value       = azurerm_subnet.database_subnet.id
}
