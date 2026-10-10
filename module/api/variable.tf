variable "db_table_name" {
  type        = string
  description = "DynamoDB table name"
}

variable "db_table_arn" {
  type        = string
  description = "DynbamoDN tbale ARN"
}

variable "jwt_issuer" {
  type        = string
  description = "Cognito issuer URL for the JWT authorizer"
}

variable "jwt_audience" {
  type        = string
  description = "Cognito app client ID (ID-token audience)"
}

variable "protected_lambdas" {
  type = map(object({
    invoke_arn    = string
    function_name = string
  }))
  description = "Lambdas reachable through JWT-protected routes, keyed by short name"
  default     = {}
}

variable "protected_routes" {
  type        = map(string)
  description = "Route key (e.g. \"GET /courses\") => key in protected_lambdas"
  default     = {}
}