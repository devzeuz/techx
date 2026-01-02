variable "table_arn" {
  description = "The ARN of the DynamoDB table."
  type        = string
}

variable "ssm_arn" {
  description = "The ARN of the SSM Parameter."
  type        = string
}