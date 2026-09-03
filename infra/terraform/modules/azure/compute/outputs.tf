output "fqdn" {
  description = "Nombre de dominio totalmente calificado (FQDN) de la API FastAPI"
  value       = azurerm_container_app.api.ingress[0].fqdn
}

output "api_url" {
  description = "URL HTTPS pública de la API en Azure Container Apps"
  value       = "https://${azurerm_container_app.api.ingress[0].fqdn}"
}
