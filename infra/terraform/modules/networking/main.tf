# ==============================================================================
# Módulo de Networking - VPC, Subredes Multicapa y Aislamiento Zero-Trust
# ==============================================================================

# 1. VPC Principal Aislada
resource "google_compute_network" "vpc" {
  name                    = "${var.project_name}-${var.environment}-vpc"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

# 2. Subred Pública (DMZ para Load Balancer & Ingress)
resource "google_compute_subnetwork" "public" {
  count         = length(var.public_subnet_cidrs)
  name          = "${var.project_name}-${var.environment}-public-sub-${count.index}"
  ip_cidr_range = var.public_subnet_cidrs[count.index]
  region        = "us-east1"
  network       = google_compute_network.vpc.id
}

# 3. Subred Privada de Aplicación (Cómputo / API FastAPI)
resource "google_compute_subnetwork" "app_private" {
  count                    = length(var.app_subnet_cidrs)
  name                     = "${var.project_name}-${var.environment}-app-sub-${count.index}"
  ip_cidr_range            = var.app_subnet_cidrs[count.index]
  region                   = "us-east1"
  network                  = google_compute_network.vpc.id
  private_ip_google_access = true
}

# 4. Subred Privada de Datos (PostgreSQL & Redis Aislados)
resource "google_compute_subnetwork" "data_private" {
  count                    = length(var.data_subnet_cidrs)
  name                     = "${var.project_name}-${var.environment}-data-sub-${count.index}"
  ip_cidr_range            = var.data_subnet_cidrs[count.index]
  region                   = "us-east1"
  network                  = google_compute_network.vpc.id
  private_ip_google_access = true
}

# 5. Cloud Router y Cloud NAT (Permite a la API actualizarse sin tener IP pública)
resource "google_compute_router" "router" {
  name    = "${var.project_name}-${var.environment}-router"
  region  = "us-east1"
  network = google_compute_network.vpc.id
}

resource "google_compute_router_nat" "nat" {
  name                               = "${var.project_name}-${var.environment}-nat"
  router                             = google_compute_router.router.name
  region                             = "us-east1"
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}

# 6. Rango de IP Global Reservado para Private Service Access (Cloud SQL & Redis)
resource "google_compute_global_address" "private_ip_alloc" {
  name          = "${var.project_name}-${var.environment}-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

# 7. Reglas de Firewall (Segmentación y Zero-Trust)
resource "google_compute_firewall" "allow_internal" {
  name    = "${var.project_name}-${var.environment}-allow-internal"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["5000", "5432", "6379"]
  }

  source_ranges = [var.vpc_cidr]
}

resource "google_compute_firewall" "allow_healthchecks" {
  name    = "${var.project_name}-${var.environment}-allow-healthchecks"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["80", "443", "5000"]
  }

  # Rangos oficiales de Google Cloud Health Checkers
  source_ranges = ["130.211.0.0/22", "35.191.0.0/16"]
}
