variable "table_name" {
  description = "DynamoDB table name"
  type        = string
}

variable "table_arn" {
  description = "DynamoDB table ARN"
  type        = string
}

variable "youtube_ssm_name" {
  description = "SSM parameter name holding the YouTube Data API key"
  type        = string
}

variable "youtube_ssm_arn" {
  description = "SSM parameter ARN holding the YouTube Data API key"
  type        = string
}
