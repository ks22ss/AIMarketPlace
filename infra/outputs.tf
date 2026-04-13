output "bucket_name" {
  description = "Globally unique S3 bucket name."
  value       = aws_s3_bucket.uploads.id
}

output "bucket_arn" {
  description = "ARN of the uploads bucket."
  value       = aws_s3_bucket.uploads.arn
}

output "bucket_region" {
  description = "AWS region where the bucket lives."
  value       = var.aws_region
}

output "aws_cli_upload_example" {
  description = "Example aws CLI command to upload a file."
  value       = "aws s3 cp ./local-file.txt s3://${aws_s3_bucket.uploads.id}/prefix/local-file.txt --region ${var.aws_region}"
}

output "cors_enabled" {
  description = "Whether S3 CORS is configured (needed for browser PUT/POST to presigned URLs)."
  value       = local.cors_enabled
}
