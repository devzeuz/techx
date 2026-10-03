variable "account_id" {
  description = "AWS Account ID — used to make bucket name globally unique"
  type        = string
}

variable "frame_extractor_lambda_arn" {
  description = "ARN of the frame-extractor Lambda to trigger on pause map upload"
  type        = string
}

variable "frame_extractor_invoke_permission_id" {
  description = "Dependency token: ID of the aws_lambda_permission allowing S3 to invoke frame-extractor"
  type        = string
}
