output "vpc_id" {
  description = "ID de la VPC creada"
  value       = google_compute_network.vpc.id
}

output "vpc_name" {
  description = "Nombre de la VPC creada"
  value       = google_compute_network.vpc.name
}

output "app_subnet_ids" {
  description = "IDs de las subredes de aplicación"
  value       = google_compute_subnetwork.app_private[*].id
}

output "data_subnet_ids" {
  description = "IDs de las subredes de base de datos"
  value       = google_compute_subnetwork.data_private[*].id
}

output "private_ip_alloc_name" {
  description = "Nombre del rango reservado para peering privado"
  value       = google_compute_global_address.private_ip_alloc.name
}
