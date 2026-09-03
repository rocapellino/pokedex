output "bucket_id" {
  description = "Nombre único del Bucket S3 creado"
  value       = aws_s3_bucket.assets.id
}

output "bucket_arn" {
  description = "ARN del Bucket S3"
  value       = aws_s3_bucket.assets.arn
}

output "bucket_regional_domain_name" {
  description = "Nombre de dominio regional del Bucket S3"
  value       = aws_s3_bucket.assets.bucket_regional_domain_name
}
