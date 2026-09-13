# ==============================================================================
# Variables - Nube Pública (AWS EKS) - Plantilla de Referencia Arquitectónica
# ==============================================================================
# NOTA: Este entorno es ilustrativo del patrón multi-cloud. Proxmox VE es el único
# target físico on-premises GA soportado. Utilice este entorno como plantilla
# desacoplada parametrizada en caso de adoptar AWS como proveedor cloud.
# ==============================================================================

variable "aws_region" {
  type        = string
  default     = "us-east-1"
  description = "Región de AWS para el despliegue del clúster"
}

variable "cluster_name" {
  type        = string
  default     = "pokedex-cloud-cluster"
  description = "Nombre del clúster EKS gestionado"
}

variable "vpc_id" {
  type        = string
  default     = "vpc-0123456789abcdef0"
  description = "Identificador de la VPC de AWS donde residirá el clúster EKS"
}

variable "subnet_ids" {
  type        = list(string)
  default     = ["subnet-0123456789abcdef0", "subnet-0fedcba9876543210"]
  description = "Lista de subnets privadas para los worker node groups de EKS"
}

variable "control_plane_subnet_ids" {
  type        = list(string)
  default     = ["subnet-0123456789abcdef0", "subnet-0fedcba9876543210"]
  description = "Lista de subnets dedicadas para las interfaces de red del plano de control EKS"
}

variable "node_instance_types" {
  type        = list(string)
  default     = ["t3.large"]
  description = "Tipos de instancia para los worker nodes de Kubernetes"
}

variable "cluster_endpoint_public_access_cidrs" {
  type        = list(string)
  default     = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]
  description = "Lista de bloques CIDR autorizados para acceder al endpoint público de la API de EKS"
}
