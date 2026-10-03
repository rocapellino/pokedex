# ADR-005: Gestión Canónica de Secretos con External Secrets Operator (ESO), HashiCorp Vault CE y Rotación Automatizada

## Estado

Aceptado

## Contexto

El almacenamiento de credenciales en texto claro dentro de repositorios Git viola las prácticas esenciales de DevSecOps y expone la plataforma a filtraciones. Se requiere una estrategia desacoplada que soporte tanto nubes públicas (AWS Secrets Manager) como entornos on-premise (HashiCorp Vault CE con alta seguridad criptográfica).

Asimismo, el runbook operacional [`docs/operations/secret-rotation.md`](../operations/secret-rotation.md) estableció el inventario y periodicidad de rotación para contraseñas de PostgreSQL, Redis, API Keys de administración y tokens de sesión. Sin embargo, a nivel de arquitectura y automatización declarativa existían desafíos técnicos adicionales:

1. **Desincronización de Pods ante Mutaciones**: Cuando un secreto es actualizado en Kubernetes (por sincronización de ESO o rotación de emergencia), los pods en ejecución conservan las variables de entorno inyectadas en su inicialización (`envFrom: secretRef`). Sin un controlador o mecanismo que observe estas mutaciones y dispare un *RollingUpdate* progresivo, las aplicaciones continúan operando con credenciales obsoletas hasta su próximo despliegue o reinicio accidental.
2. **Falta de Estandarización de Anotaciones en Helm**: Se requería un contrato inmutable para la presencia de la anotación `reloader.stakater.com/auto: "true"` en los componentes consumidores de secretos.
3. **Ausencia de Intervalos de Refresco Acotados**: Sin un `refreshInterval` estricto en el recurso `ExternalSecret`, la detección de cambios en proveedores remotos (Vault o AWS Secrets Manager) dependía de eventos manuales o intervalos indeterminados.
4. **Carencia de Auditoría Automatizada**: No se disponía de un gate de validación en CI/CD que verificase que el 100% de los componentes consumidores de secretos incluyesen mecanismos de recarga dinámica y que ningún `ConfigMap` albergase material criptográfico sensible.

## Decisión

Se adopta **External Secrets Operator (ESO)** como el estándar desacoplado universal de sincronización de secretos en Kubernetes, articulando una arquitectura integral de gestión, sincronización periódica y rotación automatizada:

### 1. Topología de Backends Canónicos

1. **Backend On-Premise Canónico (Proxmox VE):** HashiCorp Vault CE en LXC 810 con almacenamiento Raft, TLS estricto, esquema Shamir 5/3 y Zero-Disk persistence. Se implementa el principio de **Mínimo Privilegio (Zero-Trust)** erradicando roles o políticas comodín (`pokedex-role` / `pokedex-policy`):
   - **Producción:** Acceso restringido a `secret/data/pokedex/prod/*` mediante `pokedex-prod-role` (`ClusterSecretStore/vault-backend`).
   - **Pre-producción:** Acceso restringido a `secret/data/pokedex/preprod/*` mediante `pokedex-preprod-role` (`ClusterSecretStore/vault-backend-preprod`).
2. **Backend Cloud-Ready (AWS EKS):** AWS Secrets Manager mediante autenticación IAM IRSA (`ClusterSecretStore/aws-secrets-manager`).
3. **Mecanismo de Inyección en Pods:** `v1/Secret pokemon-secrets` generado automáticamente por ESO y consumido por los pods mediante `envFrom`.
4. **Retiro Definitivo de Bitnami Sealed Secrets:** Bitnami Sealed Secrets y su utilidad asociada (`scripts/seal-secret.ts`) fueron formalmente retirados del repositorio bajo el hito `CLN-002`, consolidando a Vault CE y ESO como el mecanismo exclusivo para todos los entornos.

### 2. Contrato Inmutable de Recarga Dinámica con Stakater Reloader

Todo recurso `Deployment` que consuma secretos mediante `secretRef` o `secretKeyRef` debe incorporar declarativamente la anotación:

```yaml
annotations:
  reloader.stakater.com/auto: "true"
```

Al detectar cambios en el recurso `v1/Secret` sincronizado por ESO, el controlador de **Stakater Reloader** computa un nuevo hash SHA-256 de las cargas útiles y muta una anotación interna en la plantilla de Pods (`spec.template.metadata.annotations`), provocando que el Deployment Controller de Kubernetes ejecute un *RollingUpdate* ordenado respetando las garantías de terminación grácil ([ADR-015](./ADR-015-pod-lifecycle-graceful-shutdown-and-probes.md)) y disponibilidad ([ADR-014](./ADR-014-elastic-autoscaling-hpa-and-pod-disruption-budget.md)).

### 3. Sincronización Periódica Acotada en External Secrets Operator

El recurso `ExternalSecret` formaliza un intervalo de refresco máximo de 1 hora en producción (`refreshInterval: "1h"`):

- Permite detectar y aplicar rotaciones programadas aguas arriba (AWS Secrets Manager / Vault) de forma completamente desatendida.
- Reduce la ventana máxima de exposición a 60 minutos ante una rotación de credenciales por compromiso de seguridad.

### 4. Protocolo de Rotación Dual-Secret y Tolerancia a Fallos

Para evitar interrupciones de servicio durante la rotación de credenciales relacionales:

- **PostgreSQL**: Se aprovecha la capa de multiplexación de conexiones con PgBouncer ([ADR-011](./ADR-011-persistence-drizzle-orm-and-pgbouncer.md)), permitiendo actualizar la contraseña del pooler y los clientes backend sin degradación en curso.
- **Sesiones Administrativas**: El sistema de autenticación de doble capa ([ADR-010](./ADR-010-authentication-and-session-management.md)) soporta la invalidación distribuida mediante Redis (`jti`), forzando la re-emisión segura de credenciales de sesión.

### 5. Gate de Auditoría de Rotación en CI/CD

Se incorpora la herramienta tipada [`scripts/verify-secret-rotation.ts`](../../scripts/verify-secret-rotation.ts) y la tarea canónica `task secrets:audit-rotation`:

- Comprueba que todos los Deployments soporten e incluyan la anotación de Stakater Reloader.
- Verifica que las plantillas `ExternalSecret` apliquen un `refreshInterval` válido (<= 24h).
- Audita que ningún `ConfigMap` contenga claves prohibidas (`PASSWORD`, `ADMIN_API_KEY`, `SESSION_SECRET`, `BACKUP_ENCRYPTION_KEY`).

### 6. Adaptabilidad Multi-Entorno: Perfil Minimal Viable Platform (Proxmox VE) vs. Cloud (AWS)

Se establece la justificación técnica de la convivencia de ambos enfoques:

- **Limitación Técnica de `checksum/config`:** La anotación de Helm calcula el hash SHA-256 de `templates/configmap.yaml` únicamente durante la renderización del chart (`helm upgrade`). Dado que el recurso `v1/Secret pokemon-secrets` se genera y actualiza de manera asíncrona en runtime por External Secrets Operator (ESO), **las rotaciones de secretos upstream no mutan el hash de `checksum/config`**.
- **Necesidad de Stakater Reloader en Cloud (AWS EKS):** En producción enterprise cloud, la rotación de credenciales en AWS Secrets Manager es desatendida y continua. Reloader actúa como un observador en tiempo de ejecución de la API de Kubernetes, detectando cuando ESO actualiza el Secret y disparando el RollingUpdate automático sin redeploy de Helm.
- **Perfil Lean On-Premise (Proxmox VE):** En Proxmox VE K3s, para priorizar la huella ultraliviana (< 1 GB RAM) y reducir la superficie RBAC en laboratorio/MVP, **Stakater Reloader está desactivado** (`reloader.enabled: false`, `reloader.stakater.com/auto: null`). Los cambios de configuración se delegan a `checksum/config`, y ante una rotación de secretos en Vault se asume el reinicio progresivo manual o por pipeline (`kubectl rollout restart deployment/pokemon-api -n pokemon-app`).

## Consecuencias

### Positivas

- **Cero Secretos en Claro en Git**: Aislamiento estricto por ambiente con blast radius nulo entre pre-prod y prod.
- **Cero Downtime en Rotación**: Despliegue progresivo de Pods sin interrupción del tráfico de usuarios ni cortes de servicio.
- **Automatización de Extremo a Extremo**: La actualización en el almacén de secretos upstream se propaga automáticamente al clúster y a los procesos en memoria.
- **Cumplimiento y Gobernanza**: Validación estática fail-closed en pipelines de integración continua mediante `task secrets:audit-rotation`.
- **Almacenamiento Raft Transaccional**: Cifrado en reposo y eliminación de archivos de credenciales en disco.

### Compensaciones y Mitigaciones

- **Custodia de Llaves Shamir**: Requiere la custodia segura de las llaves Shamir (3 de 5 requeridas para el unseal tras reinicio del hipervisor Proxmox).
- **Consumo de Recursos en Clúster Cloud**: Requiere mantener en ejecución el Pod del controlador Stakater Reloader en entornos cloud.
- **Invalidación de Sesiones**: La rotación de `ADMIN_SESSION_SECRET` revoca sesiones administrativas activas; se mitiga documentando la ventana de mantenimiento y avisos a operadores.

---

## Trazabilidad y Decisiones Consolidadas

- **ADR-022 (Rotación Automatizada de Credenciales, ESO y Stakater Reloader)**: Consolidado dentro de este registro. Las directrices de anotaciones automáticas de Reloader (`reloader.stakater.com/auto`), intervalo de refresco acotado en `ExternalSecret` (`refreshInterval: 1h`), auditoría de rotación estática en CI/CD y coexistencia de perfil Lean Proxmox vs Cloud AWS forman ahora parte indivisible de la arquitectura canónica de secretos gobernada por este ADR.
