data "archive_file" "zip_lambda"{
    type = "zip"
    source_file = "${path.module}/api_handler.py"
    output_path = "${path.module}/src/api_handler.zip"
}

resource "aws_lambda_function" "api_handler" {
  function_name = "api-read-handler"
  role          = aws_iam_role.api_role.arn
  handler       = "api_handler.lambda_handler"
  runtime       = "python3.11"
  filename      =  data.archive_file.zip_lambda.output_path

  environment {
    variables = {
      TABLE_NAME = var.db_table_name
    }
  }
}

resource "aws_apigatewayv2_api" "http_api" {
  name          = "tech-content-api"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET"]
  }
}

resource "aws_apigatewayv2_integration" "lambda_link" {
  api_id           = aws_apigatewayv2_api.http_api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.api_handler.invoke_arn
}

#Create a route 'get/videos' for the API gateway"

resource "aws_apigatewayv2_route" "get_videos" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /videos"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_link.id}"
}

# Permission: Allow API Gateway to "knock" on Lambda's door
resource "aws_lambda_permission" "allow_api" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api_handler.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}