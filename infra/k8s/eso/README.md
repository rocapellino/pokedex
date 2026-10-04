# External Secrets Operator (ESO) — Arquitectura Canónica Multi-Entorno

Este directorio contiene la arquitectura declarativa de referencia para la gestión centralizada de secretos en Kubernetes mediante **External Secrets Operator (ESO)** conforme a la decisión canónica del commit #206 y el Plan de Consolidación Arquitectónica.

---

## 🎯 Modelo Canónico Único (Zero-Trust Least Privilege)

| Entorno | Operador | Proveedor Upstream | ClusterSecretStore | Rol de Vault / IAM | Ruta de Secretos | Secret Destino |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Prod cloud (blueprint, ADR-030)** | ESO | Backend elegido al activar el entorno | `ClusterSecretStore/cloud-secret-store` (se declara al activar) | Según el proveedor | `pokedex/prod` | `pokemon-secrets` |
| **Proxmox Prod (retirado, ADR-030)** | — | — | `ClusterSecretStore/vault-backend` retirado | — | `secret/data/pokedex/prod/*` | `pokemon-secrets` |
| **Proxmox Pre-prod (Active)** | ESO | HashiCorp Vault (K8s Auth) | `ClusterSecretStore/vault-backend-preprod` | `pokedex-preprod-role` | `secret/data/pokedex/preprod/*` | `pokemon-secrets` |

---

## 📐 Manifiestos y Taxonomía Operativa

1. **`cluster-secret-store.yaml` [ACTIVE / CANONICAL]:** Manifiesto canónico consolidado para despliegue unificado de plataforma que define los conectores de clúster de Proxmox (`vault-backend` para Proxmox Prod, en retiro, y `vault-backend-preprod` para Pre-prod). El store del blueprint prod cloud (`cloud-secret-store`) se declara al activarlo (ADR-030). Actúa como la única SSOT contractual de `ClusterSecretStore` consumida por `tests/security/vault_redeploy_contract.test.ts` y `scripts/k8s-rollout-restart.ts`. Los antiguos manifiestos fragmentados (`vault-backend.yaml`, `vault-backend-preprod.yaml`, `aws-secrets-manager.yaml`) fueron deprecados y consolidados de forma definitiva para prevenir drift de configuración.
2. **`external-secret-pokedex.yaml` [REFERENCE STATIC]:** Recurso `ExternalSecret` estático de referencia técnica. La SSOT operativa viva, templarizada y GitOps-aware reside en el Chart Helm (`infra/helm/pokedex/templates/externalsecret.yaml`).
3. **`backup-offsite-externalsecret.yaml.template` [TEMPLATE]:** Plantilla declarativa para la sincronización de credenciales de respaldo off-site (rclone / S3 / Google Drive) gestionada por ESO.

---

## 🛡️ Principio de Mínimo Privilegio (Zero-Trust)

Se erradicó por completo el uso de roles o políticas comodín globales (`pokedex-role` / `pokedex-policy`). Cada entorno posee su propia ServiceAccount en Kubernetes vinculada a un rol estricto en Vault que solo autoriza lectura sobre su prefijo dedicado (`preprod/*` o `prod/*`). Una eventual vulneración de credenciales en pre-producción no otorga acceso alguno al árbol de producción.

---

## 🔄 Flujo de Sincronización y Rotación

1. El operador de seguridad o sistema de gestión de identidades actualiza el secreto en Vault o en el backend del entorno cloud.
2. ESO detecta el cambio en su ciclo de reconciliación (`1h`) y actualiza atómicamente el Secret `pokemon-secrets`.
3. En entornos productivos Proxmox (perfil Lean MVP sin Reloader), se ejecuta `npm run k8s:rollout-restart` para un refresco ordenado y progresivo.
