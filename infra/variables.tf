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
