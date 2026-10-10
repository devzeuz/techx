
output "pipeline_role_arn" {
  description = "ARN of the pipeline IAM role (audio_downloader + frame_extractor)"
  value       = aws_iam_role.pipeline_role.arn
}

output "pause_builder_role_arn" {
  description = "ARN of the pause-map-builder IAM role"
  value       = aws_iam_role.pause_builder_role.arn
}
output "gemini_describer_role_arn" {
  description = "ARN of the Gemini describer IAM role"
  value       = aws_iam_role.gemini_describer_role.arn
}
