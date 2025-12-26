provider "aws" {
  region = var.aws_region
}

terraform {
  cloud {
    organization = "practice-lab-"

    workspaces {
      name = "techco"
    }
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.100.0"
    }
  }

  required_version = ">= 1.5.0"
}