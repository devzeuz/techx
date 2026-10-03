output "table_arn" {
  description = "The ARN of the DynamoDB table"
  value       = aws_dynamodb_table.main.arn
}

output "table_name" {
  description = "The name of the DynamoDB table"
  value       = aws_dynamodb_table.main.name
}
output "stream_arn" {
  description = "DynamoDB Stream ARN for Lambda event source mapping"
  value       = aws_dynamodb_table.main.stream_arn
}
