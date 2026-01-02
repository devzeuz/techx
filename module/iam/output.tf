output "lambda_role_arn" {
  description = "The ARN of the IAM Role for Lambda"
  value       = aws_iam_role.ingestor_role.arn
}