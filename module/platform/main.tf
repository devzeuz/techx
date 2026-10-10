# ─────────────────────────────────────────────────────────────────────────────
# TechX core platform — catalog, user data, manual curation
# All Lambdas share one source bundle (common.py, course_writer.py, youtube.py)
# ─────────────────────────────────────────────────────────────────────────────

data "archive_file" "platform_src" {
  type        = "zip"
  source_dir  = "${path.module}/src"
  output_path = "${path.module}/build/platform.zip"
  excludes    = ["__pycache__", "**/__pycache__/**"]
}

# ── IAM ──────────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "platform_api" {
  name               = "techx-platform-api-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = { Purpose = "Platform-API" }
}

resource "aws_iam_role_policy" "platform_api" {
  name = "techx-platform-api-policy"
  role = aws_iam_role.platform_api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:Scan", "dynamodb:Query", "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
        Resource = var.table_arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

resource "aws_iam_role" "curation" {
  name               = "techx-curation-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = { Purpose = "Admin-Curation" }
}

resource "aws_iam_role_policy" "curation" {
  name = "techx-curation-policy"
  role = aws_iam_role.curation.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["dynamodb:Query", "dynamodb:GetItem", "dynamodb:PutItem",
        "dynamodb:DeleteItem", "dynamodb:BatchWriteItem"]
        Resource = var.table_arn
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = [var.youtube_ssm_arn]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# ── Lambdas ──────────────────────────────────────────────────────────────────

resource "aws_lambda_function" "platform_api" {
  function_name    = "techx-platform-api"
  role             = aws_iam_role.platform_api.arn
  handler          = "platform_api.lambda_handler"
  runtime          = "python3.11"
  filename         = data.archive_file.platform_src.output_path
  source_code_hash = data.archive_file.platform_src.output_base64sha256
  timeout          = 10
  memory_size      = 256

  tags = { Purpose = "Catalog-Enrollment-Progress-Notes" }

  environment {
    variables = { TABLE_NAME = var.table_name }
  }
}

resource "aws_lambda_function" "course_ingestor" {
  function_name    = "techx-course-ingestor"
  role             = aws_iam_role.curation.arn
  handler          = "course_ingestor.lambda_handler"
  runtime          = "python3.11"
  filename         = data.archive_file.platform_src.output_path
  source_code_hash = data.archive_file.platform_src.output_base64sha256
  timeout          = 29 # HTTP API integration limit is 30s
  memory_size      = 256

  tags = { Purpose = "Manual-Curation-Playlist-Import" }

  environment {
    variables = {
      TABLE_NAME       = var.table_name
      YOUTUBE_SSM_PATH = var.youtube_ssm_name
    }
  }
}
