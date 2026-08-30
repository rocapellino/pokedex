output "service_uri" {
  description = "URI del servicio Cloud Run"
  value       = google_cloud_run_v2_service.api_service.uri
}

output "service_name" {
  description = "Nombre del servicio Cloud Run"
  value       = google_cloud_run_v2_service.api_service.name
}
