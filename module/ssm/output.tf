output "ssm_arn" {
  description = "The ARN of the YouTube API Key SSM Parameter"
  value       = aws_ssm_parameter.youtube_api_key.arn
}

output "ssm_name" {
  description = "The name of the YouTube API Key SSM Parameter"
  value       = aws_ssm_parameter.youtube_api_key.name
}

output "gemini_ssm_arn" {
  description = "The ARN of the Gemini API Key SSM Parameter"
  value       = aws_ssm_parameter.gemini_api_key.arn
}

output "gemini_ssm_name" {
  description = "The name of the Gemini API Key SSM Parameter"
  value       = aws_ssm_parameter.gemini_api_key.name
}