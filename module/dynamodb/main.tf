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

  # Enable Streams for the Gemini describer Lambda trigger (Phase 2)
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  tags = {
    Name = var.table_name
  }
}