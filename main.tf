data "aws_caller_identity" "current" {}

module "database" {
  source = "./module/dynamodb"
}

module "ssm" {
  source = "./module/ssm"
}

module "iam" {
  source           = "./module/iam"
  table_arn        = module.database.table_arn
  ssm_arn          = module.ssm.ssm_arn
  gemini_ssm_arn   = module.ssm.gemini_ssm_arn
  media_bucket_arn = module.s3_media.bucket_arn
}

module "s3_media" {
  source                               = "./module/s3"
  account_id                           = data.aws_caller_identity.current.account_id
  frame_extractor_lambda_arn           = module.lambda.frame_extractor_arn
  frame_extractor_invoke_permission_id = module.lambda.frame_extractor_permission_id
}

# Audio-description pipeline (enhancement to the core platform)
module "lambda" {
  source                    = "./module/lambda"
  pipeline_role_arn         = module.iam.pipeline_role_arn
  pause_builder_role_arn    = module.iam.pause_builder_role_arn
  gemini_describer_role_arn = module.iam.gemini_describer_role_arn
  table_name                = module.database.table_name
  gemini_ssm_name           = module.ssm.gemini_ssm_name
  media_bucket              = module.s3_media.bucket_name
  db_stream_arn             = module.database.stream_arn
}

# ─── Core TechX platform ─────────────────────────────────────────────────────

module "cognito" {
  source = "./module/cognito"
}

module "platform" {
  source           = "./module/platform"
  table_name       = module.database.table_name
  table_arn        = module.database.table_arn
  youtube_ssm_name = module.ssm.ssm_name
  youtube_ssm_arn  = module.ssm.ssm_arn

  media_bucket_name    = module.s3_media.bucket_name
  media_bucket_arn     = module.s3_media.bucket_arn
  audio_downloader_arn = module.lambda.audio_downloader_arn
  gemini_ssm_name      = module.ssm.gemini_ssm_name
  gemini_ssm_arn       = module.ssm.gemini_ssm_arn
}

module "api" {
  source        = "./module/api"
  db_table_name = module.database.table_name
  db_table_arn  = module.database.table_arn

  jwt_issuer        = module.cognito.jwt_issuer
  jwt_audience      = module.cognito.user_pool_client_id
  protected_lambdas = module.platform.lambdas

  protected_routes = {
    # Learners
    "GET /courses"      = "platform_api"
    "GET /courses/{id}" = "platform_api"
    "GET /user"         = "platform_api"
    "POST /user"        = "platform_api"
    # Learners: audio descriptions (enhancement)
    "GET /courses/{id}/descriptions" = "descriptions"
    "GET /videos/{id}/descriptions"  = "descriptions"
    # Learners: AI Tutor (Phase 4)
    "GET /videos/{id}/tutor" = "tutor"
    "POST /videos/{id}/ask"  = "tutor"
    # Admins only (enforced in Lambda): manual curation
    "POST /admin/ingest" = "course_ingestor"
    # Admins only (enforced in Lambda): queue audio-description generation
    "POST /admin/descriptions" = "descriptions"
    # Admins only (enforced in Lambda): AI Curator
    "POST /admin/curations"              = "curator"
    "GET /admin/curations"               = "curator"
    "GET /admin/curations/{id}"          = "curator"
    "DELETE /admin/curations/{id}"       = "curator"
    "POST /admin/curations/{id}/publish" = "curator"
    "POST /admin/curations/{id}/retry"   = "curator"
  }
}

module "s3_frontend" {
  source = "./module/s3_frontend"
}