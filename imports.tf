# Adopt the ORIGINAL TechX Cognito resources into state (no recreation).
# Safe to delete these blocks after the first successful apply.

import {
  to = module.cognito.aws_cognito_user_pool.main
  id = "us-east-1_Ei6OwcKPR"
}

import {
  to = module.cognito.aws_cognito_user_pool_client.web
  id = "us-east-1_Ei6OwcKPR/67tnfepeir9j7b63qpvrj7sv8b"
}

import {
  to = module.cognito.aws_cognito_user_group.admin
  id = "us-east-1_Ei6OwcKPR/Admin"
}
