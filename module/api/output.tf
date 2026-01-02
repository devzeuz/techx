output "api_url" {
    value = aws_apigatewayv2_api.http_api.api_endpoint
    description = "The endpoint to the api gateway"
}

output "archive_path" {
    value = data.archive_file.zip_lambda.output_path
    description = "The path to the zipped lambda function"
}