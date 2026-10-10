data "archive_file" "zip_lambda" {
  type        = "zip"
  source_file = "${path.module}/src/api_handler.py"
  output_path = "${path.module}/src/api_handler.zip"
}

resource "aws_lambda_function" "api_handler" {
  function_name = "techx-api-handler"
  role          = aws_iam_role.api_role.arn
  handler       = "api_handler.lambda_handler"
  runtime       = "python3.11"
  filename      = data.archive_file.zip_lambda.output_path

  tags = { Purpose = "API-Read-Videos" }

  environment {
    variables = {
      TABLE_NAME = var.db_table_name
    }
  }
}

resource "aws_apigatewayv2_api" "http_api" {
  name          = "techx-content-api"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 3600
  }
  tags = { Purpose = "Video-Content-API" }
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
# ── GET /videos/{id} — video details + descriptions (Phase 2) ────────────────
resource "aws_apigatewayv2_route" "get_video_by_id" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /videos/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_link.id}"
}

# ── Default stage with auto-deploy ───────────────────────────────────────────
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http_api.id
  name        = "$default"
  auto_deploy = true
}

# ─────────────────────────────────────────────────────────────────────────────
# Authenticated platform routes (Cognito JWT)
# Admin-only routes are additionally enforced inside each Lambda.
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.http_api.id
  name             = "techx-cognito-jwt"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    issuer   = var.jwt_issuer
    audience = [var.jwt_audience]
  }
}

resource "aws_apigatewayv2_integration" "protected" {
  for_each = var.protected_lambdas

  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = each.value.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "protected" {
  for_each = var.protected_routes

  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = each.key
  target             = "integrations/${aws_apigatewayv2_integration.protected[each.value].id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_lambda_permission" "protected" {
  for_each = var.protected_lambdas

  statement_id  = "AllowHttpApiInvoke"
  action        = "lambda:InvokeFunction"
  function_name = each.value.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}
