# ADR-022: Rotación Automatizada de Credenciales, Sincronización Periódica con ESO y Recarga Dinámica Zero-Downtime con Stakater Reloader

## Estado

Aceptado

## Contexto

En [ADR-005](./ADR-005-secret-management.md) se formalizó el uso de External Secrets Operator (ESO) y Bitnami Sealed Secrets para la gestión segura de secretos en reposo, desacoplando los valores confidenciales del control de versiones en Git. Asimismo, el runbook operacional [`docs/operations/secret-rotation.md`](../operations/secret-rotation.md) estableció el inventario y periodicidad de rotación para contraseñas de PostgreSQL, Redis, API Keys de administración y tokens de sesión.

Sin embargo, a nivel de arquitectura y automatización declarativa existían los siguientes desafíos técnicos:

1. **Desincronización de Pods ante Mutaciones**: Cuando un secreto es actualizado en Kubernetes (por sincronización de ESO o rotación de emergencia), los Pods en ejecución conservan las variables de entorno inyectadas en su inicialización (`envFrom: secretRef`). Sin un controlador que observe estas mutaciones y dispare un *RollingUpdate* progresivo, las aplicaciones continúan operando con credenciales obsoletas hasta su próximo despliegue o reinicio accidental.
2. **Falta de Estandarización de Anotaciones en Helm**: Si bien el backend contaba con soporte para anotaciones de Deployment, el frontend carecía de dicho bloque y los valores por defecto de producción no garantizaban contractualmente la presencia de la anotación `reloader.stakater.com/auto: "true"`.
3. **Ausencia de Intervalos de Refresco Acotados**: Sin un `refreshInterval` estricto en el recurso `ExternalSecret`, la detección de cambios en proveedores remotos (Vault o AWS Secrets Manager) dependía de eventos manuales o intervalos indeterminados.
4. **Carencia de Auditoría Automatizada**: No se disponía de un gate de validación en CI/CD que verificase que el 100% de los componentes consumidores de secretos incluyesen mecanismos de recarga dinámica y que ningún `ConfigMap` albergase material criptográfico sensible.

## Decisión

Se formaliza una arquitectura integral de **Rotación Automatizada de Credenciales y Recarga Dinámica Zero-Downtime** basada en cuatro directrices:

### 1. Contrato Inmutable de Recarga Dinámica con Stakater Reloader

Todo recurso `Deployment` que consuma secretos mediante `secretRef` o `secretKeyRef` debe incorporar obligatoriamente la anotación declarativa:
```yaml
annotations:
  reloader.stakater.com/auto: "true"
```
Al detectar cambios en el recurso `v1/Secret` generado por ESO o Sealed Secrets, el controlador de **Stakater Reloader** computa un nuevo hash SHA-256 de las cargas útiles y muta una anotación interna en la plantilla de Pods (`spec.template.metadata.annotations`), provocando que el Deployment Controller de Kubernetes ejecute un *RollingUpdate* ordenado respetando las garantías de terminación grácil ([ADR-015](./ADR-015-pod-lifecycle-graceful-shutdown-and-probes.md)) y disponibilidad ([ADR-014](./ADR-014-elastic-autoscaling-hpa-and-pod-disruption-budget.md)).

### 2. Sincronización Periódica Acotada en External Secrets Operator

El recurso `ExternalSecret` formaliza un intervalo de refresco máximo de 1 hora en producción (`refreshInterval: "1h"`):
- Permite detectar y aplicar rotaciones programadas aguas arriba (AWS Secrets Manager / Vault) de forma completamente desatendida.
- Reduce la ventana máxima de exposición a 60 minutos ante una rotación de credenciales por compromiso de seguridad.

### 3. Protocolo de Rotación Dual-Secret y Tolerancia a Fallos

Para evitar interrupciones de servicio durante la rotación de credenciales relacionales:
- **PostgreSQL**: Se aprovecha la capa de multiplexación de conexiones con PgBouncer ([ADR-011](./ADR-011-persistence-drizzle-orm-and-pgbouncer.md)), permitiendo actualizar la contraseña del pooler y los clientes backend sin degradación en curso.
- **Sesiones Administrativas**: El sistema de autenticación de doble capa ([ADR-010](./ADR-010-authentication-and-session-management.md)) soporta la invalidación distribuida mediante Redis (`jti`), forzando la re-emisión segura de credenciales de sesión.

### 4. Gate de Auditoría de Rotación en CI/CD

Se incorpora la herramienta tipada [`scripts/verify-secret-rotation.ts`](../../scripts/verify-secret-rotation.ts) y la tarea canónica `task secrets:audit-rotation`:

- Comprueba que todos los Deployments soporten e incluyan la anotación de Stakater Reloader.
- Verifica que las plantillas `ExternalSecret` apliquen un `refreshInterval` válido (<= 24h).
- Audita que ningún `ConfigMap` contenga claves prohibidas (`PASSWORD`, `ADMIN_API_KEY`, `SESSION_SECRET`, `BACKUP_ENCRYPTION_KEY`).

## Consecuencias

### Positivas

- **Cero Downtime en Rotación**: Despliegue progresivo de Pods sin interrupción del tráfico de usuarios.
- **Automatización de Extremo a Extremo**: La actualización en el almacén de secretos upstream se propaga automáticamente al clúster y a los procesos en memoria.
- **Cumplimiento y Gobernanza**: Validación estática fail-closed en pipelines de integración continua.

### Compensaciones y Mitigaciones

- **Consumo de Recursos en Clúster**: Requiere mantener en ejecución el Pod del controlador Stakater Reloader en el clúster.
- **Invalidación de Sesiones**: La rotación de `ADMIN_SESSION_SECRET` revoca sesiones administrativas activas; se mitiga documentando la ventana de mantenimiento y avisos a operadores.
