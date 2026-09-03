output "storage_account_name" {
  description = "Nombre de la cuenta de almacenamiento en Azure"
  value       = azurerm_storage_account.storage.name
}

output "container_name" {
  description = "Nombre del contenedor de blobs"
  value       = azurerm_storage_container.assets.name
}

output "primary_blob_endpoint" {
  description = "Endpoint público primario de Blob Storage"
  value       = azurerm_storage_account.storage.primary_blob_endpoint
}
