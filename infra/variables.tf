variable "aws_region" {
  description = "AWS region for the S3 bucket."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short name used in the bucket name (lowercase letters, numbers, hyphens)."
  type        = string
  default     = "aimarketplace"

  validation {
    condition     = can(regex("^[a-z0-9-]{3,32}$", var.project_name))
    error_message = "project_name must be 3-32 chars: lowercase letters, digits, hyphens only."
  }
}

variable "enable_versioning" {
  description = "Enable S3 versioning (helps recover from accidental overwrites)."
  type        = bool
  default     = false
}

variable "environment" {
  description = "Environment label applied via provider default_tags (cost allocation, filtering)."
  type        = string
  default     = "dev"
}

variable "cors_allowed_origins" {
  description = "Allowed origins for direct browser uploads to S3 (presigned URLs). Leave empty to omit CORS until the web app needs SPA→S3 uploads."
  type        = list(string)
  default     = []
}

variable "cors_allowed_methods" {
  description = "HTTP methods allowed in CORS preflight (only used when cors_allowed_origins is non-empty)."
  type        = list(string)
  default     = ["GET", "PUT", "HEAD"]
}

variable "cors_allowed_headers" {
  description = "Request headers allowed from the browser (only used when cors_allowed_origins is non-empty)."
  type        = list(string)
  default     = ["*"]
}

variable "cors_expose_headers" {
  description = "Response headers the browser may read (ETag is common for multipart or verification)."
  type        = list(string)
  default     = ["ETag"]
}

variable "cors_max_age_seconds" {
  description = "Browser cache duration for CORS preflight responses."
  type        = number
  default     = 3000
}
