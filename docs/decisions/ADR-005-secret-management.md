# ADR-005: Gestión Segura de Secretos con External Secrets Operator y Sealed Secrets

## Estado
Aceptado

## Contexto
El almacenamiento de credenciales en texto claro dentro de repositorios Git viola las prácticas esenciales de DevSecOps y expone la plataforma a filtraciones. Se requiere una estrategia desacoplada que soporte tanto nubes públicas (AWS Secrets Manager) como entornos on-premise (HashiCorp Vault o Bitnami Sealed Secrets).

## Decisión
Se adopta **External Secrets Operator (ESO)** como el estándar desacoplado de sincronización de secretos en Kubernetes:

1. Las plantillas del Chart de Helm generan recursos `ExternalSecret` que sincronizan credenciales desde `SecretStore` o `ClusterSecretStore`.
2. Para entornos sin vault externo o validación local, se mantiene soporte para **Bitnami Sealed Secrets** cifrados asimétricamente mediante `scripts/seal-secret.ts`.
3. Se integran anotaciones de **Stakater Reloader** (`secret.reloader.stakater.com/reload`) para recargar automáticamente Pods sin intervención humana ante rotaciones de secretos.

## Consecuencias
- **Positivas**: Cero secretos en claro en el repositorio Git, soporte multi-proveedor (AWS, Vault, GCP, Azure), rotación sin reinicios manuales.
- **Compensaciones**: Requiere la instalación previa del operador ESO en el clúster.
