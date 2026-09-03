# 🌐 Arquitectura de Infraestructura como Código (IaC) Multi-Cloud

Este directorio contiene las definiciones declarativas de Terraform para desplegar la plataforma Pokédex en múltiples nubes públicas (**Google Cloud Platform**, **Amazon Web Services**, **Microsoft Azure**) y entornos de virtualización on-premises (**Proxmox VE**).

---

## 🏛️ Matriz de Arquitectura Multi-Cloud

Para garantizar paridad y portabilidad entre nubes, los módulos implementan los 4 pilares esenciales de la arquitectura:

| Capa Arquitectónica | Google Cloud (GCP) | Amazon Web Services (AWS) | Microsoft Azure | On-Premises (Proxmox VE) |
| :--- | :--- | :--- | :--- | :--- |
| **Networking** | VPC, Subnets, Cloud NAT | VPC, Public/Private Subnets, IGW, NAT Gateway | Virtual Network (VNet), Subnets delegadas | Linux Bridge (`vmbr0`), VLANs |
| **Compute** | Cloud Run (FastAPI Serverless) | AWS App Runner (Serverless Container) | Azure Container Apps (ACA) | Contenedor LXC con Docker Engine |
| **Database & Cache** | Cloud SQL (PostgreSQL) + Memorystore (Redis) | RDS PostgreSQL + ElastiCache Redis | Azure Database for PostgreSQL (Flexible Server) + Azure Cache for Redis | PostgreSQL + Redis sobre Docker |
| **Storage & CDN** | Cloud Storage (GCS) + Cloud CDN | S3 Bucket + Access Block + CORS | Azure Storage Account + Blob Container | MinIO S3-compatible |

---

## 📁 Estructura del Directorio

```
infra/terraform/
├── README.md                                 # Documentación general y guía de uso
├── modules/
│   ├── gcp/                                  # Módulos para Google Cloud Platform
│   │   ├── networking/                       # VPC, Subnets, Cloud Router, Cloud NAT
│   │   ├── database/                         # Cloud SQL PostgreSQL + Memorystore Redis
│   │   ├── storage/                          # GCS Bucket + Políticas IAM
│   │   └── compute/                          # Cloud Run + Serverless VPC Connector
│   ├── aws/                                  # Módulos para Amazon Web Services
│   │   ├── networking/                       # AWS VPC, Subredes públicas/privadas, IGW, NAT GW
│   │   ├── database/                         # RDS PostgreSQL + ElastiCache Redis + Security Groups
│   │   ├── storage/                          # S3 Bucket + Bloqueo público + CORS
│   │   └── compute/                          # AWS App Runner + Configuración de autoescalado
│   ├── azure/                                # Módulos para Microsoft Azure
│   │   ├── networking/                       # Resource Group, VNet y Subnets delegadas
│   │   ├── database/                         # PostgreSQL Flexible Server + Azure Cache for Redis
│   │   ├── storage/                          # Storage Account + Blob Container
│   │   └── compute/                          # Azure Container Apps (ACA) + CAE
│   └── proxmox/                              # Módulo On-Premises para Proxmox VE (LXC)
└── envs/
    ├── gcp/dev/                              # Entorno de desarrollo en Google Cloud
    ├── aws/dev/                              # Entorno de desarrollo en Amazon Web Services
    ├── azure/dev/                            # Entorno de desarrollo en Microsoft Azure
    └── proxmox/dev/                          # Entorno de desarrollo en Proxmox VE
```

---

## 🚀 Despliegue Rápido por Proveedor

### 1. Google Cloud Platform (GCP)
```bash
cd infra/terraform/envs/gcp/dev
cp terraform.tfvars.example terraform.tfvars
# Editar variables requeridas (gcp_project_id, db_password)
terraform init
terraform plan
terraform apply
```
*O usando Taskfile:*
```bash
task tf:plan:gcp
```

### 2. Amazon Web Services (AWS)
```bash
cd infra/terraform/envs/aws/dev
cp terraform.tfvars.example terraform.tfvars
# Editar variables requeridas (db_password, aws_region)
terraform init
terraform plan
terraform apply
```
*O usando Taskfile:*
```bash
task tf:plan:aws
```

### 3. Microsoft Azure
```bash
cd infra/terraform/envs/azure/dev
cp terraform.tfvars.example terraform.tfvars
# Editar variables requeridas (db_password, azure_location)
terraform init
terraform plan
terraform apply
```
*O usando Taskfile:*
```bash
task tf:plan:azure
```

### 4. Proxmox VE (On-Premises)
```bash
cd infra/terraform/envs/proxmox/dev
cp terraform.tfvars.example terraform.tfvars
# Editar credenciales de API (proxmox_api_url, proxmox_api_token_id, proxmox_api_token_secret)
terraform init
terraform plan
terraform apply
```
*O usando Taskfile:*
```bash
task tf:plan:proxmox
```

---

## 🔒 Política de Seguridad y Manejo de Secretos

1. **Sin credenciales en código:** Ningún archivo `.tf` contiene contraseñas maestras, tokens de API o claves por defecto.
2. **Variables sensibles:** Todas las variables sensibles están tipadas con `sensitive = true` para evitar su filtrado en logs de consola y CI/CD.
3. **Inyección en CI/CD:** Se recomienda inyectar `TF_VAR_db_password`, `AWS_SECRET_ACCESS_KEY`, `ARM_CLIENT_SECRET` o `TF_VAR_proxmox_api_token_secret` como secretos en GitHub Actions, Vault o Bitnami Sealed Secrets.
