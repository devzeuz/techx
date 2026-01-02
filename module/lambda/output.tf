output "lambda_archive_path" {
    value       = data.archive_file.zip_lambda.output_path
    description = "The path to the zipped lambda function"
}