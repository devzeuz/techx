variable "table_arn" {
  description = "ARN of the DynamoDB table"
  type        = string
}

variable "ssm_arn" {
  description = "ARN of the YouTube API Key SSM Parameter"
  type        = string
}

variable "gemini_ssm_arn" {
  description = "ARN of the Gemini API Key SSM Parameter"
  type        = string
}

variable "media_bucket_arn" {
  description = "ARN of the S3 media bucket (for pipeline Lambda permissions)"
  type        = string
}