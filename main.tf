module "database" {
  source     = "./module/dynamodb"
}

module "iam" {
  source = "./module/iam"
  table_arn = module.database.table_arn
  ssm_arn = module.ssm.ssm_arn

}

module "ssm" {
  source = "./module/ssm"
}

module "lambda" {
  source = "./module/lambda"
  lambda_role_arn = module.iam.lambda_role_arn
  table_name = module.database.table_name 
  ssm_name = module.ssm.ssm_name
}

module "api" {
  source = "./module/api"
  db_table_name = module.database.table_name
  db_table_arn = module.database.table_arn
}