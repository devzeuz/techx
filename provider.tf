provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "TechX"
      Application = "AI-Audio-Description"
      Environment = "dev"
      ManagedBy   = "Terraform"
      CostCenter  = "TechX-AI"
      Owner       = "practicelab"
    }
  }
}

terraform {
  backend "s3" {
    bucket  = "techx-terraform-state-522814725174"
    key     = "techx/terraform.tfstate"
    region  = "us-east-1"
    encrypt = true

    # Optional: uncomment to enable state locking via DynamoDB
    # dynamodb_table = "techx-terraform-locks"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.100.0"
    }
  }

  required_version = ">= 1.5.0"
}