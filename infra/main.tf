provider "aws" {
  region = var.aws_region
}

resource "random_id" "bucket_suffix" {
  byte_length = 3
}

resource "aws_s3_bucket" "uploads" {
  bucket = "${var.project_name}-uploads-${random_id.bucket_suffix.hex}"

  tags = {
    Name    = "${var.project_name}-uploads"
    Purpose = "file-uploads"
  }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  versioning_configuration {
    status = var.enable_versioning ? "Enabled" : "Suspended"
  }
}

resource "aws_s3_bucket_ownership_controls" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  depends_on = [aws_s3_bucket_public_access_block.uploads]

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}
