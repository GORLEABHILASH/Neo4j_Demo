provider "aws" {
  region = var.aws_region
}

# Explicitly set the AWS provider version
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 4.0.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = ">= 2.10.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = ">= 2.5.0"
    }
  }
  required_version = ">= 1.0.0"
}

# Use a more recent version of the VPC module
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 4.0"

  name = var.cluster_name
  cidr = "10.0.0.0/16"

  azs             = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway     = true
  single_nat_gateway     = true
  one_nat_gateway_per_az = false

  enable_dns_hostnames = true
  enable_dns_support   = true

   # Add the required ELB tags for public and private subnets
  public_subnet_tags = {
    "kubernetes.io/role/elb" = 1
  }
  
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = 1
  }


  tags = {
    Environment = var.environment
    Project     = "neo4j-demo-migration"
    Terraform   = "true"
  }
}

# Create IAM role for EKS nodes with ECR permissions
resource "aws_iam_role" "eks_node_role" {
  name = "eks-node-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      },
    ]
  })

  tags = {
    Environment = var.environment
    Project     = "neo4j-demo-migration"
  }
}

# Create ECR access policy for EKS nodes
resource "aws_iam_policy" "eks_ecr_access" {
  name        = "eks-ecr-access-policy"
  description = "Allows EKS nodes to pull images from ECR"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetAuthorizationToken"
        ],
        Resource = "*"
      }
    ]
  })

  tags = {
    Environment = var.environment
    Project     = "neo4j-demo-migration"
  }
}

# Attach required AWS managed policies for EKS worker nodes
resource "aws_iam_role_policy_attachment" "eks_worker_node_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.eks_node_role.name
}

resource "aws_iam_role_policy_attachment" "eks_cni_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.eks_node_role.name
}

resource "aws_iam_role_policy_attachment" "eks_container_registry_read_only" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.eks_node_role.name
}

# Attach our custom ECR policy
resource "aws_iam_role_policy_attachment" "eks_node_ecr_access" {
  policy_arn = aws_iam_policy.eks_ecr_access.arn
  role       = aws_iam_role.eks_node_role.name
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  cluster_name    = var.cluster_name
  cluster_version = "1.27"

  cluster_endpoint_public_access = true

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # Enable OIDC provider for service account IAM roles
  enable_irsa = true

  # EKS Managed Node Group(s) - now using our custom role with ECR permissions
  eks_managed_node_groups = {
    neo4j_nodes = {
      min_size     = 3
      max_size     = 10
      desired_size = 5

      instance_types      = ["m5.xlarge"]
      capacity_type       = "ON_DEMAND"
      iam_role_arn        = aws_iam_role.eks_node_role.arn
      use_custom_launch_template = false
      
      labels = {
        Environment = var.environment
        GpuEnabled  = "false"
      }

      tags = {
        Environment = var.environment
        Project     = "neo4j-demo-migration"
      }
    }
  }

  # AWS Auth configuration for IAM role access
  manage_aws_auth_configmap = true
  aws_auth_roles = [
    {
      rolearn  = aws_iam_role.eks_admin.arn
      username = "admin"
      groups   = ["system:masters"]
    },
  ]

  tags = {
    Environment = var.environment
    Project     = "neo4j-demo-migration"
    Terraform   = "true"
  }
}

# Create IAM role for EKS admin access
resource "aws_iam_role" "eks_admin" {
  name = "eks-admin-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      },
    ]
  })
}

# Create IAM policy for ALB Controller with ACM permissions
# Create IAM policy for ALB Controller with ACM permissions
resource "aws_iam_policy" "alb_controller_policy" {
  name        = "ALBIngressControllerIAMPolicy"
  description = "Allows ALB Ingress Controller to manage ALB and ACM certificates"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "ec2:DescribeAvailabilityZones",
          "acm:DescribeCertificate",
          "acm:ListCertificates",
          "acm:GetCertificate",
          "acm:RequestCertificate",
          "acm:AddTagsToCertificate"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow",
        Action = [
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:CreateSecurityGroup",
          "ec2:CreateTags",
          "ec2:DeleteTags",
          "ec2:DeleteSecurityGroup",
          "ec2:DescribeAccountAttributes",
          "ec2:DescribeAddresses",
          "ec2:DescribeInstances",
          "ec2:DescribeInstanceStatus",
          "ec2:DescribeInternetGateways",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeSubnets",
          "ec2:DescribeTags",
          "ec2:DescribeVpcs",
          "ec2:ModifyInstanceAttribute",
          "ec2:ModifyNetworkInterfaceAttribute",
          "ec2:RevokeSecurityGroupIngress"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow",
        Action = [
          "elasticloadbalancing:AddListenerCertificates",
          "elasticloadbalancing:AddTags",
          "elasticloadbalancing:CreateListener",
          "elasticloadbalancing:CreateLoadBalancer",
          "elasticloadbalancing:CreateRule",
          "elasticloadbalancing:CreateTargetGroup",
          "elasticloadbalancing:DeleteListener",
          "elasticloadbalancing:DeleteLoadBalancer",
          "elasticloadbalancing:DeleteRule",
          "elasticloadbalancing:DeleteTargetGroup",
          "elasticloadbalancing:DeregisterTargets",
          "elasticloadbalancing:DescribeListenerCertificates",
          "elasticloadbalancing:DescribeListeners",
          "elasticloadbalancing:DescribeListenerAttributes",
          "elasticloadbalancing:DescribeLoadBalancers",
          "elasticloadbalancing:DescribeLoadBalancerAttributes",
          "elasticloadbalancing:DescribeRules",
          "elasticloadbalancing:DescribeSSLPolicies",
          "elasticloadbalancing:DescribeTags",
          "elasticloadbalancing:DescribeTargetGroups",
          "elasticloadbalancing:DescribeTargetGroupAttributes",
          "elasticloadbalancing:DescribeTargetHealth",
          "elasticloadbalancing:ModifyListener",
          "elasticloadbalancing:ModifyLoadBalancerAttributes",
          "elasticloadbalancing:ModifyRule",
          "elasticloadbalancing:ModifyTargetGroup",
          "elasticloadbalancing:ModifyTargetGroupAttributes",
          "elasticloadbalancing:RegisterTargets",
          "elasticloadbalancing:RemoveListenerCertificates",
          "elasticloadbalancing:RemoveTags",
          "elasticloadbalancing:SetIpAddressType",
          "elasticloadbalancing:SetSecurityGroups",
          "elasticloadbalancing:SetSubnets",
          "elasticloadbalancing:SetWebAcl"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow",
        Action = [
          "iam:CreateServiceLinkedRole",
          "iam:GetServerCertificate",
          "iam:ListServerCertificates"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow",
        Action = [
          "waf-regional:GetWebACLForResource",
          "waf-regional:GetWebACL",
          "waf-regional:AssociateWebACL",
          "waf-regional:DisassociateWebACL"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow",
        Action = [
          "tag:GetResources",
          "tag:TagResources"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow",
        Action = [
          "waf:GetWebACL"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow",
        Action = [
          "wafv2:GetWebACL",
          "wafv2:GetWebACLForResource",
          "wafv2:AssociateWebACL",
          "wafv2:DisassociateWebACL"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow",
        Action = [
          "shield:GetSubscriptionState",
          "shield:DescribeProtection",
          "shield:CreateProtection",
          "shield:DeleteProtection"
        ],
        Resource = "*"
      }
    ]
  })

  tags = {
    Environment = var.environment
    Project     = "neo4j-demo-migration"
  }
}
# Create IAM role for ALB Controller using IRSA (IAM Roles for Service Accounts)
resource "aws_iam_role" "alb_controller_role" {
  name = "alb-controller-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRoleWithWebIdentity"
        Effect = "Allow"
        Principal = {
          Federated = module.eks.oidc_provider_arn
        }
        Condition = {
          StringEquals = {
            "${replace(module.eks.oidc_provider, "https://", "")}:sub": "system:serviceaccount:kube-system:aws-load-balancer-controller"
          }
        }
      },
    ]
  })

  tags = {
    Environment = var.environment
    Project     = "neo4j-demo-migration"
  }
}

# Attach ALB Controller policy to the role
resource "aws_iam_role_policy_attachment" "alb_controller_policy_attachment" {
  policy_arn = aws_iam_policy.alb_controller_policy.arn
  role       = aws_iam_role.alb_controller_role.name
}

# Create ECR repositories for all demo applications
resource "aws_ecr_repository" "demo_repos" {
  for_each = toset(var.demo_app_names)
  
  name                 = each.key
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Environment = var.environment
    Project     = "neo4j-demo-migration"
  }
}

# Create S3 bucket for shared configuration and persistent data
resource "aws_s3_bucket" "demo_config" {
  bucket = "neo4j-demo-config-${var.environment}"

  tags = {
    Environment = var.environment
    Project     = "neo4j-demo-migration"
  }
}

resource "aws_s3_bucket_versioning" "demo_config_versioning" {
  bucket = aws_s3_bucket.demo_config.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

# Create DynamoDB table for deployment tracking
resource "aws_dynamodb_table" "demo_deployments" {
  name         = "neo4j-demo-deployments"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "demo_id"
  range_key    = "version"

  attribute {
    name = "demo_id"
    type = "S"
  }

  attribute {
    name = "version" 
    type = "S"
  }

  tags = {
    Environment = var.environment
    Project     = "neo4j-demo-migration"
  }
}

# Install AWS Load Balancer Controller with the IAM role
resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"
  
  set {
    name  = "clusterName"
    value = var.cluster_name
  }
  
  set {
    name  = "serviceAccount.create"
    value = "true"
  }
  
  set {
    name  = "serviceAccount.name"
    value = "aws-load-balancer-controller"
  }
  
  set {
    name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = aws_iam_role.alb_controller_role.arn
  }
  
  depends_on = [module.eks, aws_iam_role_policy_attachment.alb_controller_policy_attachment]
}

# Create IAM policy for External DNS
resource "aws_iam_policy" "external_dns_policy" {
  name        = "ExternalDNSIAMPolicy"
  description = "Allows External DNS to manage Route53 records"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "route53:ChangeResourceRecordSets"
        ],
        Resource = [
          "arn:aws:route53:::hostedzone/*"
        ]
      },
      {
        Effect = "Allow",
        Action = [
          "route53:ListHostedZones",
          "route53:ListResourceRecordSets"
        ],
        Resource = [
          "*"
        ]
      }
    ]
  })

  tags = {
    Environment = var.environment
    Project     = "neo4j-demo-migration"
  }
}

# Create IAM role for External DNS using IRSA
resource "aws_iam_role" "external_dns_role" {
  name = "external-dns-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRoleWithWebIdentity"
        Effect = "Allow"
        Principal = {
          Federated = module.eks.oidc_provider_arn
        }
        Condition = {
          StringEquals = {
            "${replace(module.eks.oidc_provider, "https://", "")}:sub": "system:serviceaccount:kube-system:external-dns"
          }
        }
      },
    ]
  })

  tags = {
    Environment = var.environment
    Project     = "neo4j-demo-migration"
  }
}

# Attach External DNS policy to the role
resource "aws_iam_role_policy_attachment" "external_dns_policy_attachment" {
  policy_arn = aws_iam_policy.external_dns_policy.arn
  role       = aws_iam_role.external_dns_role.name
}

# Install External DNS for automatic DNS management with IAM role
resource "helm_release" "external_dns" {
  name       = "external-dns"
  repository = "https://kubernetes-sigs.github.io/external-dns/"
  chart      = "external-dns"
  namespace  = "kube-system"
  
  set {
    name  = "provider"
    value = "aws"
  }
  
  set {
    name  = "aws.zoneType"
    value = "public"
  }
  
  set {
    name  = "serviceAccount.create"
    value = "true"
  }
  
  set {
    name  = "serviceAccount.name"
    value = "external-dns"
  }
  
  set {
    name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = aws_iam_role.external_dns_role.arn
  }
  
  depends_on = [module.eks, aws_iam_role_policy_attachment.external_dns_policy_attachment]
}

# Add necessary parameter store entries
resource "aws_ssm_parameter" "domain_name" {
  name  = "/neo4j-demos/${var.environment}/domain-name"
  type  = "String"
  value = var.domain_name
}

resource "aws_ssm_parameter" "neo4j_version" {
  name  = "/neo4j-demos/${var.environment}/neo4j-version"
  type  = "String"
  value = var.neo4j_version
}

resource "aws_ssm_parameter" "neo4j_password" {
  name  = "/neo4j-demos/${var.environment}/neo4j-password"
  type  = "SecureString"
  value = var.neo4j_password
}

resource "aws_ssm_parameter" "app_replicas" {
  name  = "/neo4j-demos/${var.environment}/app-replicas"
  type  = "String"
  value = var.app_replicas
}

# Output the IAM role information for reference
output "eks_node_role_name" {
  description = "Name of the IAM role used by EKS nodes"
  value       = aws_iam_role.eks_node_role.name
}

output "alb_controller_role_name" {
  description = "Name of the IAM role used by AWS Load Balancer Controller"
  value       = aws_iam_role.alb_controller_role.name
}

output "external_dns_role_name" {
  description = "Name of the IAM role used by External DNS"
  value       = aws_iam_role.external_dns_role.name
}

output "cluster_endpoint" {
  description = "Endpoint for EKS control plane"
  value       = module.eks.cluster_endpoint
}

output "cluster_name" {
  description = "Name of the EKS cluster"
  value       = module.eks.cluster_name
}
