output "ssm_arn"{
    description = "The ARN of the SSM Parameter"
    value       = aws_ssm_parameter.youtube_api_key.arn
}

output "ssm_name"{
    description = "The name of the SSM Parameter"
    value       = aws_ssm_parameter.youtube_api_key.name
}