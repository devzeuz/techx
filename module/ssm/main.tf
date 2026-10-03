resource "aws_ssm_parameter" "youtube_api_key" {
  name        = "youtube_api_key"
  description = "YouTube Data API v3 Key"
  type        = "SecureString"
  value       = "REPLACE_ME_IN_CONSOLE" # Terraform won't overwrite after first apply
  tags        = { Purpose = "YouTube-API-Auth" }

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "gemini_api_key" {
  name        = "gemini_api_key"
  description = "Google Gemini API Key for Vision analysis and RAG Q&A"
  type        = "SecureString"
  value       = "REPLACE_ME_IN_CONSOLE" # Set your key via AWS Console or CLI
  tags        = { Purpose = "Gemini-Vision-API-Auth" }

  lifecycle {
    ignore_changes = [value]
  }
}

