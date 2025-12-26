resource "archive_file" "zip-lambda"{
    type = "zip"
    source_file = "${path.module}/src/ingestor.py"
    output_path = "${path.module}/src/ingestor.zip"
}

resource "aws_lambda_function" "ingestor" {
  function_name    = "content-ingestor"
  role             = var.lambda_role_arn
  handler          = "ingestor.lambda_handler"
  runtime          = "python3.11"
  filename         = archive_file.zip-lambda.output_path # You'll create this via CLI
  timeout          = 30

  environment {
    variables = {
      TABLE_NAME       = var.table_name
      API_KEY_SSM_PATH = var.ssm_name
    }
  }
}
