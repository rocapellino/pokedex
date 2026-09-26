# ADR-005: Gestión Segura de Secretos con External Secrets Operator (ESO) y HashiCorp Vault CE

## Estado

Aceptado

## Contexto

El almacenamiento de credenciales en texto claro dentro de repositorios Git viola las prácticas esenciales de DevSecOps y expone la plataforma a filtraciones. Se requiere una estrategia desacoplada que soporte tanto nubes públicas (AWS Secrets Manager) como entornos on-premise (HashiCorp Vault CE con alta seguridad criptográfica).

## Decisión

Se adopta **External Secrets Operator (ESO)** como el estándar desacoplado universal de sincronización de secretos en Kubernetes:

1. **Backend On-Premise Canónico (Proxmox VE):** HashiCorp Vault CE en LXC 810 con almacenamiento Raft, TLS estricto, esquema Shamir 5/3 y Zero-Disk persistence. Se implementa el principio de **Mínimo Privilegio (Zero-Trust)** erradicando roles o políticas comodín (`pokedex-role` / `pokedex-policy`):
   - **Producción:** Acceso restringido a `secret/data/pokedex/prod/*` mediante `pokedex-prod-role` (`ClusterSecretStore/vault-backend`).
   - **Pre-producción:** Acceso restringido a `secret/data/pokedex/preprod/*` mediante `pokedex-preprod-role` (`ClusterSecretStore/vault-backend-preprod`).
2. **Backend Cloud-Ready (AWS EKS):** AWS Secrets Manager mediante autenticación IAM IRSA (`ClusterSecretStore/aws-secrets-manager`).
3. **Mecanismo de Inyección en Pods:** `v1/Secret pokemon-secrets` generado automáticamente por ESO y consumido por los pods mediante `envFrom`.
4. **Retiro Definitivo de Bitnami Sealed Secrets:** Bitnami Sealed Secrets y su utilidad asociada (`scripts/seal-secret.ts`) fueron formalmente retirados del repositorio bajo el hito `CLN-002`, consolidando a Vault CE y ESO como el mecanismo exclusivo para todos los entornos.
5. **Recarga Dinámica:** Stakater Reloader en entornos Cloud (AWS), y reinicio progresivo determinista (`k8s-rollout-restart.ts`) en Proxmox VE para preservar el perfil Lean MVP (ADR-024).

## Consecuencias

- **Positivas**: Cero secretos en claro en Git, segregación estricta por ambiente con blast radius nulo entre pre-prod y prod, almacenamiento Raft transaccional, rotación auditable y eliminación de archivos de credenciales en disco.
- **Compensaciones**: Requiere la custodia segura de las llaves Shamir (3 de 5 requeridas para el unseal tras reinicio del hipervisor Proxmox).
