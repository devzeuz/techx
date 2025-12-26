module "database" {
  source     = "./modules/dynamodb"
}

module "iam" {
  source = "./modules/iam"
  table_arn = module.database.table_arn
  ssm_arn = module.ssm.ssm_arn

}

module "ssm" {
  source = "./modules/ssm"
}

module "lambda" {
  source = "./modules/lambda"
  lambda_role_arn = module.iam.lambda_role_arn
  table_name = module.database.table_name 
  ssm_name = module.ssm.ssm_name
}