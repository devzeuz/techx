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

variable "media_bucket_name" {
  description = "Media bucket holding generated audio-description clips"
  type        = string
}

variable "media_bucket_arn" {
  description = "Media bucket ARN"
  type        = string
}

variable "audio_downloader_arn" {
  description = "ARN of the audio-downloader Lambda (entry point of the AD pipeline)"
  type        = string
}
