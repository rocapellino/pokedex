# ADR-005: Gestión Segura de Secretos con External Secrets Operator (ESO) y HashiCorp Vault CE

## Estado
Aceptado

## Contexto
El almacenamiento de credenciales en texto claro dentro de repositorios Git viola las prácticas esenciales de DevSecOps y expone la plataforma a filtraciones. Se requiere una estrategia desacoplada que soporte tanto nubes públicas (AWS Secrets Manager) como entornos on-premise (HashiCorp Vault CE con alta seguridad criptográfica).

## Decisión
Se adopta **External Secrets Operator (ESO)** como el estándar desacoplado universal de sincronización de secretos en Kubernetes:

1. **Backend On-Premise Canónico (Proxmox VE):** HashiCorp Vault CE en LXC 110 con almacenamiento Raft, TLS estricto, esquema Shamir 5/3 y Zero-Disk persistence (`ClusterSecretStore/vault-backend`). Los secretos se segregan lógicamente entre Pre-prod (`secret/data/pokedex/preprod/*`) y Prod (`secret/data/pokedex/prod/*`).
2. **Backend Cloud-Ready (AWS EKS):** AWS Secrets Manager mediante autenticación IAM IRSA (`ClusterSecretStore/aws-secrets-manager`).
3. **Mecanismo de Inyección en Pods:** `v1/Secret pokemon-secrets` generado automáticamente por ESO y consumido por los pods mediante `envFrom`.
4. **Soporte Histórico Legacy:** Bitnami Sealed Secrets se mantiene como mecanismo legacy de soporte para entornos sin conectividad de vault mediante la utilidad tipada `scripts/seal-secret.ts`.
5. **Recarga Dinámica:** Stakater Reloader en entornos Cloud (AWS), y reinicio progresivo determinista (`k8s-rollout-restart.ts`) en Proxmox VE para preservar el perfil Lean MVP (ADR-024).

## Consecuencias
- **Positivas**: Cero secretos en claro en Git, segregación por ambiente lógico, almacenamiento Raft transaccional, rotación auditable y eliminación de archivos de credenciales en disco.
- **Compensaciones**: Requiere la custodia segura de las llaves Shamir (3 de 5 requeridas para el unseal tras reinicio del hipervisor Proxmox).
