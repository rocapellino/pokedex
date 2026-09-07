# ==============================================================================
# Provisión de Clúster EKS en Nube Pública con OpenTofu
# ==============================================================================

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "20.8.5"
  #checkov:skip=CKV_TF_1: "El módulo oficial EKS se descarga del registro con versión semántica fija"
  #checkov:skip=CKV_TF_2: "Versión semántica fija de módulo oficial EKS"

  cluster_name    = var.cluster_name
  cluster_version = "1.30"

  cluster_endpoint_public_access = true

  vpc_id                   = "vpc-0123456789abcdef0"
  subnet_ids               = ["subnet-0123456789abcdef0", "subnet-0fedcba9876543210"]
  control_plane_subnet_ids = ["subnet-0123456789abcdef0", "subnet-0fedcba9876543210"]

  eks_managed_node_groups = {
    standard_nodes = {
      min_size     = 2
      max_size     = 10
      desired_size = 3

      instance_types = var.node_instance_types
      capacity_type  = "ON_DEMAND"
    }
  }

  tags = {
    Environment = "production-cloud"
    ManagedBy   = "OpenTofu"
    Application = "Pokédex"
  }
}
