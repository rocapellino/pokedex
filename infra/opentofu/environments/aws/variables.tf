# ==============================================================================
# Variables - Nube Pública (AWS)
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
