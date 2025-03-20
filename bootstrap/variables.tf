variable "aws_region" {
  description = "AWS region for state resources"
  default     = "us-west-2"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  default     = "dev"
}

variable "project_name" {
  description = "Project name used for resource naming"
  default     = "neo4j-demos"
}