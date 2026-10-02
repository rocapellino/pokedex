# External Secrets Operator (ESO) — Arquitectura Canónica Multi-Entorno

Este directorio contiene la arquitectura declarativa de referencia para la gestión centralizada de secretos en Kubernetes mediante **External Secrets Operator (ESO)** conforme a la decisión canónica del commit #206 y el Plan de Consolidación Arquitectónica.

---

## 🎯 Modelo Canónico Único (Zero-Trust Least Privilege)

| Entorno | Operador | Proveedor Upstream | ClusterSecretStore | Rol de Vault / IAM | Ruta de Secretos | Secret Destino |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **AWS (Cloud - Reference)** | ESO | AWS Secrets Manager (IRSA) | `ClusterSecretStore/aws-secrets-manager` | IAM Role IRSA | `pokedex/*` | `pokemon-secrets` |
| **Proxmox Prod (Active)** | ESO | HashiCorp Vault (K8s Auth) | `ClusterSecretStore/vault-backend` | `pokedex-prod-role` | `secret/data/pokedex/prod/*` | `pokemon-secrets` |
| **Proxmox Pre-prod (Active)** | ESO | HashiCorp Vault (K8s Auth) | `ClusterSecretStore/vault-backend-preprod` | `pokedex-preprod-role` | `secret/data/pokedex/preprod/*` | `pokemon-secrets` |

---

## 📐 Manifiestos y Taxonomía Operativa

1. **`cluster-secret-store.yaml` [CANONICAL AGGREGATOR]:** Manifiesto canónico consolidado para despliegue unificado de plataforma que define los tres conectores de clúster (`vault-backend` para Proxmox Prod, `vault-backend-preprod` para Proxmox Pre-prod y `aws-secrets-manager` para AWS).
2. **`vault-backend.yaml` [ENVIRONMENT ATOMIC / CONTRACT]:** Definición individual del `ClusterSecretStore` para Producción en Proxmox VE (`pokedex-prod-role`). Actúa como SSOT contractual consumida por `tests/security/vault_redeploy_contract.test.ts` y `scripts/k8s-rollout-restart.ts`.
3. **`vault-backend-preprod.yaml` [ENVIRONMENT ATOMIC / CONTRACT]:** Definición individual del `ClusterSecretStore` para Pre-producción en Proxmox VE (`pokedex-preprod-role`). SSOT contractual para la suite de pruebas de pre-producción.
4. **`aws-secrets-manager.yaml` [REFERENCE]:** Definición individual del `ClusterSecretStore` para AWS Secrets Manager en la arquitectura de portabilidad AWS EKS.
5. **`external-secret-pokedex.yaml` [REFERENCE STATIC]:** Recurso `ExternalSecret` estático de referencia técnica. La SSOT operativa viva, templarizada y GitOps-aware reside en el Chart Helm (`infra/helm/pokedex/templates/externalsecret.yaml`).

---

## 🛡️ Principio de Mínimo Privilegio (Zero-Trust)

Se erradicó por completo el uso de roles o políticas comodín globales (`pokedex-role` / `pokedex-policy`). Cada entorno posee su propia ServiceAccount en Kubernetes vinculada a un rol estricto en Vault que solo autoriza lectura sobre su prefijo dedicado (`preprod/*` o `prod/*`). Una eventual vulneración de credenciales en pre-producción no otorga acceso alguno al árbol de producción.

---

## 🔄 Flujo de Sincronización y Rotación

1. El operador de seguridad o sistema de gestión de identidades actualiza el secreto en Vault o AWS Secrets Manager.
2. ESO detecta el cambio en su ciclo de reconciliación (`1h`) y actualiza atómicamente el Secret `pokemon-secrets`.
3. En entornos productivos Proxmox (perfil Lean MVP sin Reloader), se ejecuta `npm run k8s:rollout-restart` para un refresco ordenado y progresivo.
