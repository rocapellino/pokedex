# External Secrets Operator (ESO) — Arquitectura Canónica Multi-Entorno

Este directorio contiene la arquitectura declarativa de referencia para la gestión centralizada de secretos en Kubernetes mediante **External Secrets Operator (ESO)** conforme a la decisión canónica del commit #206 y el Plan de Consolidación Arquitectónica.

## 🎯 Modelo Canónico Único

| Entorno | Operador | Proveedor Upstream | ClusterSecretStore | Secret Destino |
| :--- | :--- | :--- | :--- | :--- |
| **AWS (Cloud)** | ESO | AWS Secrets Manager (IRSA) | `ClusterSecretStore/aws-secrets-manager` | `pokemon-secrets` |
| **Proxmox (On-Prem)** | ESO | HashiCorp Vault (K8s Auth) | `ClusterSecretStore/vault-backend` | `pokemon-secrets` |

## 📐 Manifiestos
1. **`cluster-secret-store.yaml`**: Manifiesto canónico consolidado que define los dos conectores de clúster (`vault-backend` para Proxmox y `aws-secrets-manager` para AWS).
2. **`vault-backend.yaml`**: Definición individual del `ClusterSecretStore` para HashiCorp Vault en Proxmox VE.
3. **`aws-secrets-manager.yaml`**: Definición individual del `ClusterSecretStore` para AWS Secrets Manager en AWS EKS.
4. **`external-secret-pokedex.yaml`**: Recurso `ExternalSecret` de referencia que sondea el backend cada 1 hora (`refreshInterval: "1h"`) y proyecta las claves al Secret nativo `pokemon-secrets`.

## 🔄 Flujo de Sincronización y Rotación
1. El operador de seguridad o sistema de gestión de identidades actualiza el secreto en Vault o AWS Secrets Manager.
2. ESO detecta el cambio en su ciclo de reconciliación (`1h`) y actualiza atómicamente el Secret `pokemon-secrets`.
3. La aplicación recarga automáticamente las credenciales garantizando cero tiempo de inactividad.
