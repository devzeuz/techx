resource "aws_ssm_parameter" "youtube_api_key" {
  name        = "youtube_api_key"
  description = "YouTube Data API v3 Key"
  type        = "SecureString"
  value       = "REPLACE_ME_IN_CONSOLE" # Terraform won't overwrite after first apply

  lifecycle {
    ignore_changes = [value]
  }
}

