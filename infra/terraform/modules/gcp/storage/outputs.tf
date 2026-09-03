output "frontend_bucket_name" {
  description = "Nombre del bucket que aloja el frontend estático"
  value       = google_storage_bucket.frontend_bucket.name
}

output "media_bucket_name" {
  description = "Nombre del bucket para backups y assets multimedia"
  value       = google_storage_bucket.media_bucket.name
}

output "cdn_backend_id" {
  description = "ID del backend bucket para la CDN"
  value       = google_compute_backend_bucket.cdn_backend.id
}
