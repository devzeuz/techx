output "api_url" {
  description = "HTTP API base URL (set as VITE_API_URL for the frontend)"
  value       = module.api.api_url
}

output "cognito_user_pool_id" {
  value = module.cognito.user_pool_id
}

output "cognito_user_pool_client_id" {
  value = module.cognito.user_pool_client_id
}
