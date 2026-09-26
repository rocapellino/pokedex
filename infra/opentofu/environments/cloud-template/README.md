# ☁️ Entorno OpenTofu: Cloud-Template (Plantilla Universal Cloud-Neutral)

> **ESTADO DE SOPORTE:** Plantilla Canónica Multi-Cloud Neutral.
> **TARGET DE PRODUCCIÓN OFICIAL ON-PREMISES:** Proxmox VE ([`../proxmox/`](../proxmox)).

---

## 1. Propósito

Este directorio define el blueprint canónico de infraestructura cloud-neutral para la plataforma **Pokédex**, conforme a las recomendaciones de desacoplamiento de IaC por capas.

A diferencia de los entornos acoplados a APIs de un proveedor específico:

1. No impone dependencias de proveedores cloud propietarios (AWS, GCP, Azure) como requisito previo.
2. Consume exclusivamente los módulos de contrato común:
   - [`modules/compute/`](../../modules/compute): Especificación estandarizada de capacidades de cómputo.
   - [`modules/naming/`](../../modules/naming): Convención inmutable de nomenclatura de recursos.
   - [`modules/security_baseline/`](../../modules/security_baseline): Contratos de aislamiento de red y cifrado.
3. Se valida sintácticamente y estructuralmente en CI sin necesidad de credenciales de nube.

## 2. Parámetros

| Variable | Tipo | Default | Descripción |
| :--- | :--- | :--- | :--- |
| `project` | `string` | `"pokedex"` | Nombre identificador del proyecto. |
| `environment` | `string` | `"cloud-template"` | Entorno de ejecución objetivo. |
| `node_count` | `number` | `3` | Cantidad de nodos de cómputo. |
| `cpu_cores` | `number` | `4` | Cores/vCPUs asignados por nodo. |
| `memory_mb` | `number` | `8192` | Memoria RAM en MB por nodo. |
| `disk_size_gb` | `number` | `50` | Tamaño de almacenamiento en GB. |
| `network_id` | `string` | `"cloud-vpc-subnet-default"` | Identificador lógico de red o subred. |

## 3. Uso

```bash
# 1. Copiar archivo de variables de ejemplo
cp terraform.tfvars.example terraform.tfvars

# 2. Inicializar OpenTofu (sin backend remoto)
tofu init -backend=false

# 3. Validar sintaxis y configuración
tofu validate

# 4. Generar plan de ejecución
tofu plan
```
