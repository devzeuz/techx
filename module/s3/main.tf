resource "aws_s3_bucket" "media" {
  bucket        = "techx-ai-media-${var.account_id}"
  force_destroy = true
  tags          = { Purpose = "AI-Pipeline-Media-Storage" }
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

# S3 → frame-extractor trigger: fires when pause_map_builder writes a pause map
resource "aws_s3_bucket_notification" "pause_map_trigger" {
  bucket = aws_s3_bucket.media.id

  lambda_function {
    lambda_function_arn = var.frame_extractor_lambda_arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "pause-maps/"
    filter_suffix       = ".json"
  }

  # Ensure the Lambda permission exists before setting the notification
  depends_on = [var.frame_extractor_invoke_permission_id]
}
