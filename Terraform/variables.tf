variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-west-2"
}

variable "environment" {
  description = "Environment name (e.g. dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  default     = "neo4j-demo-cluster"
}

variable "demo_app_names" {
  description = "List of demo application names"
  type        = list(string)
  default     = [
    "neo4j-basic-demo",
    "neo4j-movie-recommendation",
    "neo4j-social-network",
    # Add more demo names as needed
  ]
}

variable "domain_name" {
  description = "Base domain name for demo applications"
  type        = string
  default     = "neo4j-demos.example.com"
}

variable "neo4j_version" {
  description = "Version of Neo4j to deploy"
  type        = string
  default     = "4.4.14"
}

variable "neo4j_password" {
  description = "Password for Neo4j admin user"
  type        = string
  default     = "changeme" # Make sure to override this in production
  sensitive   = true
}

variable "app_replicas" {
  description = "Number of replicas for each demo application"
  type        = string
  default     = "2"
}