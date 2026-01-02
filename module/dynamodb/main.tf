resource "aws_dynamodb_table" "main" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK" # Partition Key
  range_key    = "SK" # Sort Key

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  # Best Practice: Enable Point-in-Time Recovery for production
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = var.table_name
  }
}