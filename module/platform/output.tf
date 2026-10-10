output "lambdas" {
  description = "Platform Lambdas, keyed for API route wiring"
  value = {
    platform_api = {
      invoke_arn    = aws_lambda_function.platform_api.invoke_arn
      function_name = aws_lambda_function.platform_api.function_name
    }
    course_ingestor = {
      invoke_arn    = aws_lambda_function.course_ingestor.invoke_arn
      function_name = aws_lambda_function.course_ingestor.function_name
    }
  }
}
