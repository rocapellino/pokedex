# ☁️ Entorno OpenTofu: AWS EKS (Plantilla de Referencia Arquitectónica)

> **ESTADO DE SOPORTE:** Plantilla de Referencia / Ejemplo Arquitectónico.  
> **TARGET DE PRODUCCIÓN OFICIAL:** Proxmox VE ([`../proxmox/`](../proxmox)).

---

## 1. Propósito

Este directorio contiene la definición declarativa de infraestructura en nube pública utilizando **OpenTofu** y el módulo oficial de comunidad `terraform-aws-modules/eks/aws`.

Su propósito es:
1. Demostrar la **portabilidad absoluta** del núcleo de la plataforma Pokédex (el Helm Chart `infra/helm/pokedex` funciona idénticamente sobre este EKS).
2. Servir como **blueprint/plantilla de referencia** lista para usar en caso de que se determine desplegar en AWS en el futuro.

## 2. Parámetros y Desacoplamiento

A diferencia de versiones anteriores, este entorno no hardcodea identificadores de VPC ni subredes en `main.tf`. Todos los recursos están parametrizados a través de:
- `variables.tf`: Define tipos, valores por defecto seguros y documentación.
- `terraform.tfvars.example`: Plantilla de variables para configuración de despliegue real.

## 3. Uso

```bash
# 1. Copiar y completar variables reales
cp terraform.tfvars.example terraform.tfvars

# 2. Inicializar proveedores
tofu init

# 3. Validar sintaxis y configuración
tofu validate

# 4. Plan de ejecución
tofu plan -out=tfplan
```
