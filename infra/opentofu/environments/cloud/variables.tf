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
