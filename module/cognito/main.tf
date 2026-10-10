# ─────────────────────────────────────────────────────────────────────────────
# Cognito — the ORIGINAL TechX user pool, imported (see root imports.tf).
# Existing users and their USER#… records stay linked. Never recreate.
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_cognito_user_pool" "main" {
  name                     = "techx-tf-cognito-user-pool"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  deletion_protection      = "ACTIVE"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "techx-tf-cognito-user-pool-client"
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_user_group" "admin" {
  name         = "Admin"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "TechX curators: manual playlist import and AI Curator"
}
