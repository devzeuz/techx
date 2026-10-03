output "frame_extractor_arn" {
  description = "ARN of the frame-extractor Lambda (used by S3 bucket notification)"
  value       = aws_lambda_function.frame_extractor.arn
}

output "frame_extractor_permission_id" {
  description = "ID of the S3→frame-extractor Lambda permission (used as dependency token)"
  value       = aws_lambda_permission.allow_s3_frame_extractor.id
}

output "audio_downloader_arn" {
  description = "ARN of the audio-downloader Lambda"
  value       = aws_lambda_function.audio_downloader.arn
}
output "gemini_describer_arn" {
  description = "ARN of the Gemini describer Lambda"
  value       = aws_lambda_function.gemini_describer.arn
}
