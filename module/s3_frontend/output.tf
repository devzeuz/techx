output "website_url" {
  description = "Public URL of the TechX frontend"
  value       = aws_s3_bucket_website_configuration.frontend.website_endpoint
}

output "bucket_name" {
  description = "Frontend S3 bucket name"
  value       = aws_s3_bucket.frontend.bucket
}

output "bucket_arn" {
  description = "Frontend S3 bucket ARN"
  value       = aws_s3_bucket.frontend.arn
}
