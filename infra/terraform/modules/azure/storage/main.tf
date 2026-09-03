# ==============================================================================
# Módulo de Almacenamiento para Azure (Storage Account & Blob Container)
# ==============================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = ">= 3.80.0, < 4.0.0"
    }
  }
}

# 1. Storage Account para Assets y Media
resource "azurerm_storage_account" "storage" {
  name                     = "${lower(replace(var.project_name, "-", ""))}${var.environment}sa"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"

  tags = {
    Environment = var.environment
  }
}

# 2. Blob Container para Frontend y Sprites
resource "azurerm_storage_container" "assets" {
  name                  = "assets"
  storage_account_name  = azurerm_storage_account.storage.name
  container_access_type = "blob"
}
