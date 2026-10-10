
variable "table_name" {
  description = "The name of the DynamoDB table"
  type        = string
}


variable "media_bucket" {
  description = "Name of the S3 media bucket (audio, frames, transcripts)"
  type        = string
}

variable "pipeline_role_arn" {
  description = "IAM role ARN for the audio-downloader and frame-extractor Lambdas"
  type        = string
}

variable "pause_builder_role_arn" {
  description = "IAM role ARN for the pause-map-builder Lambda"
  type        = string
}
variable "gemini_describer_role_arn" {
  description = "IAM role ARN for the Gemini describer Lambda"
  type        = string
}

variable "db_stream_arn" {
  description = "DynamoDB Stream ARN — triggers the Gemini describer"
  type        = string
}

variable "gemini_ssm_name" {
  description = "SSM Parameter name for the Gemini API key"
  type        = string
}
