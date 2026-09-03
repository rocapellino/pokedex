# ==============================================================================
# Módulo de Redes para Azure (Resource Group, VNet y Subnets)
# ==============================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = ">= 3.80.0"
    }
  }
}

# 1. Resource Group principal
resource "azurerm_resource_group" "rg" {
  name     = "${var.project_name}-${var.environment}-rg"
  location = var.location

  tags = {
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# 2. Virtual Network (VNet)
resource "azurerm_virtual_network" "vnet" {
  name                = "${var.project_name}-${var.environment}-vnet"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  address_space       = var.vnet_address_space

  tags = {
    Environment = var.environment
  }
}

# 3. Subred para Cómputo (Azure Container Apps - ACA)
resource "azurerm_subnet" "compute_subnet" {
  name                 = "${var.project_name}-${var.environment}-compute-snet"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.1.1.0/24"]
}

# 4. Subred para PostgreSQL Flexible Server (con delegación de servicio)
resource "azurerm_subnet" "database_subnet" {
  name                 = "${var.project_name}-${var.environment}-db-snet"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.1.2.0/24"]

  delegation {
    name = "fs-delegation"
    service_delegation {
      name = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/join/action",
      ]
    }
  }
}
