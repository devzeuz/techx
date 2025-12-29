resource "aws_iam_role" "api_role" {
  name = "api-read-handler-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_policy" "api_policy" {
  name        = "api-read-dynamodb-policy"
  description = "Allows the API Lambda to read from DynamoDB"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Principle of Least Privilege: only 'Get' and 'Query'
        Action   = ["dynamodb:GetItem", "dynamodb:Query"]
        Effect   = "Allow"
        Resource = var.db_table_arn
      },
      {
        # Standard logging permissions
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Effect   = "Allow"
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "api_lambda_policy_attachment"{
    role = aws_iam_role.api_role.name
    policy_arn = aws_iam_policy.api_policy.arn
}

