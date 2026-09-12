# ==============================================================================
# Provisión de Clúster EKS en Nube Pública con OpenTofu
# ==============================================================================

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "20.8.5"
  #checkov:skip=CKV_TF_1: "El módulo oficial EKS se descarga del registro con versión semántica fija"
  #checkov:skip=CKV_TF_2: "Versión semántica fija de módulo oficial EKS"
  #trivy:ignore:AVD-AWS-0104: "Salida egress de nodos hacia registries de contenedores y endpoints AWS administrados"
  #trivy:ignore:AWS-0104: "Salida egress de nodos hacia registries de contenedores y endpoints AWS administrados"

  cluster_name    = var.cluster_name
  cluster_version = "1.30"

  # DevSecOps Hardening: Deshabilitar endpoint público y habilitar acceso privado dentro de la VPC (AWS-0040)
  cluster_endpoint_public_access       = false
  cluster_endpoint_private_access      = true
  cluster_endpoint_public_access_cidrs = var.cluster_endpoint_public_access_cidrs

  # DevSecOps Hardening: Habilitar todos los logs del plano de control en CloudWatch (AWS-0038)
  cluster_enabled_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

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
