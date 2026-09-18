# ADR-005: Gestión Segura de Secretos con External Secrets Operator y Sealed Secrets

## Estado
Aceptado

## Contexto
El almacenamiento de credenciales en texto claro dentro de repositorios Git viola las prácticas esenciales de DevSecOps y expone la plataforma a filtraciones. Se requiere una estrategia desacoplada que soporte tanto nubes públicas (AWS Secrets Manager) como entornos on-premise (HashiCorp Vault o Bitnami Sealed Secrets).

## Decisión
Se adopta **External Secrets Operator (ESO)** como el estándar desacoplado de sincronización de secretos en Kubernetes:

1. Las plantillas del Chart de Helm generan recursos `ExternalSecret` que sincronizan credenciales desde `SecretStore` o `ClusterSecretStore` (AWS Secrets Manager en Cloud, HashiCorp Vault en Proxmox).
2. Para entornos sin vault externo o validación local histórica, se mantiene soporte deprecado para **Bitnami Sealed Secrets** mediante `scripts/seal-secret.ts`.
3. Para la recarga automática ante cambios, se integran anotaciones de **Stakater Reloader** (`reloader.stakater.com/auto: "true"`) en entornos Cloud (AWS), mientras que en Proxmox VE se emplea la anotación nativa de Helm **`checksum/config`** para mantener un perfil Lean MVP sin controladores RBAC adicionales.

## Consecuencias
- **Positivas**: Cero secretos en claro en el repositorio Git, soporte multi-proveedor (AWS Secrets Manager, HashiCorp Vault), rotación automatizada y recarga determinista adaptada a cada entorno.
- **Compensaciones**: Requiere la instalación previa del operador ESO en el clúster (con backend Vault en LXC para Proxmox o AWS SM para Cloud).
