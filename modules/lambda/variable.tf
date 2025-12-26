variable lambda_role_arn {
  description = "The ARN of the IAM Role for Lambda"
  type        = string
}

variable "table_name" {
  description = "The name of the DynamoDB table."
  type        = string
}

variable "ssm_name" {
  description = "The name of the SSM Parameter."
  type        = string
}