# ADR-005: Gestión Canónica de Secretos con External Secrets Operator (ESO), HashiCorp Vault CE y Rotación Automatizada

## Estado

Aceptado (Consolida ADR-022 y alineado con ADR-030)

## Contexto

El almacenamiento de credenciales en texto claro dentro de repositorios Git viola las prácticas esenciales de DevSecOps y expone la plataforma a filtraciones. Se requiere una estrategia desacoplada de gestión de secretos que soporte tanto el entorno on-premise activo (HashiCorp Vault CE con alta seguridad criptográfica) como futuros despliegues en nube pública mediante un blueprint agnóstico.

Asimismo, el runbook operacional [`docs/operations/secret-rotation.md`](../operations/secret-rotation.md) estableció el inventario y periodicidad de rotación para contraseñas de PostgreSQL, Redis, API Keys de administración y tokens de sesión. A nivel de arquitectura y automatización declarativa existían desafíos técnicos concretos:

1. **Desincronización de Pods ante Mutaciones de Secretos**: Cuando un secreto se actualiza en Kubernetes (por sincronización de ESO o rotación de emergencia), los pods en ejecución conservan las variables de entorno inyectadas en su inicialización (`envFrom: secretRef`). Sin un mecanismo de sincronización que reinicie progresivamente las cargas de trabajo, las aplicaciones continúan operando con credenciales obsoletas hasta su próximo despliegue o reinicio accidental.
2. **Coexistencia de Perfiles Operacionales Dispares**: En clústeres cloud gestionados con recursos holgados se justifica desplegar controladores adicionales como Stakater Reloader y capas de multiplexación como PgBouncer. Por el contrario, en entornos on-premise con restricciones estrictas de hardware (perfil Lean en Proxmox VE), cada controlador añade overhead de memoria y permisos RBAC innecesarios.
3. **Ausencia de Intervalos de Refresco Acotados**: Sin un `refreshInterval` estricto en el recurso `ExternalSecret`, la detección de cambios en proveedores remotos dependía de eventos manuales o intervalos indeterminados.
4. **Carencia de Auditoría Automatizada**: No se disponía de un gate de validación en CI/CD que verificase que los componentes consumidores de secretos estuviesen formalmente parametrizados y que ningún `ConfigMap` albergase material criptográfico sensible.

---

## Decisión

Se adopta **External Secrets Operator (ESO)** como el estándar desacoplado universal de sincronización de secretos en Kubernetes. La estrategia técnica se organiza en: (1) Principios comunes a toda la plataforma, (2) Implementación operativa vigente en Pre-producción On-Premise, (3) Especificación del Blueprint Cloud inactivo y (4) Tolerancia a fallos e invalidación de sesiones.

### 1. Principios Arquitectónicos Comunes (Core Secrets Management)

- **External Secrets Operator (ESO) Universal**: Se estandariza el uso de ESO como controlador único para sincronizar credenciales desde almacenes externos hacia secretos nativos de Kubernetes.
- **Cero Secretos en Git**: Ningún secreto, credencial, certificado o token se almacena en el repositorio en claro.
- **Generación en Runtime**: El recurso `v1/Secret pokemon-secrets` es generado y conciliado automáticamente por ESO dentro del namespace `pokemon-app`, desacoplando la gestión del ciclo de vida de los pods.
- **Inyección Desacoplada**: Las cargas de trabajo consumen los secretos mediante `envFrom: secretRef`, garantizando que la aplicación lea variables de entorno estándar sin acoplarse a APIs propietarias.
- **Sincronización Periódica Acotada**: Los manifiestos `ExternalSecret` aplican un intervalo de refresco máximo de 1 hora (`refreshInterval: "1h"`), acotando la ventana máxima de propagación desatendida ante rotaciones programadas o emergencias.
- **Gobernanza y Auditoría en CI/CD**: Se institucionaliza la herramienta [`scripts/verify-secret-rotation.ts`](../../scripts/verify-secret-rotation.ts) invocable vía `task secrets:audit-rotation`. Este gate valida que las plantillas `ExternalSecret` mantengan un refresco acotado (<= 24h) y audita que ningún `ConfigMap` contenga claves prohibidas (`PASSWORD`, `ADMIN_API_KEY`, `SESSION_SECRET`, `BACKUP_ENCRYPTION_KEY`).

### 2. Implementación Pre-producción Vigente (Proxmox VE LXC 800 - Perfil Lean)

La infraestructura activa en Proxmox VE opera bajo un **Perfil Lean** ([ADR-030](./ADR-030-environment-model-local-dev-proxmox-preprod-cloud-prod.md)) diseñado para maximizar la densidad y eficiencia de recursos (< 1 GB RAM en el clúster K3s):

- **Backend On-Premise (HashiCorp Vault CE)**: Desplegado en el contenedor dedicado LXC 810 (`https://10.10.13.110:8200`) con storage backend Raft transaccional, TLS interno estricto con CA propia, persistencia cifrada en reposo y esquema de sellado Shamir 5/3 (unseal con umbral de 3 llaves).
- **Mínimo Privilegio (Zero-Trust)**:
  - Acceso restringido exclusivamente a la ruta de pre-producción `secret/data/pokedex/preprod/*`.
  - Autenticación Kubernetes mediante ServiceAccount con rol `pokedex-preprod-role`.
  - Reconciliación declarativa en el clúster vía `ClusterSecretStore/vault-backend-preprod`.
- **Ausencia Deliberada de Stakater Reloader**: Para preservar recursos de memoria y reducir la superficie de permisos RBAC del clúster, Stakater Reloader se encuentra **desactivado** (`reloader.enabled: false`, `reloader.stakater.com/auto: null` en `values.yaml`).
- **Ausencia de PgBouncer**: Siguiendo la simplificación de ADR-030 para entornos monocontenedor/mononodo, no se despliega el pooler PgBouncer; la aplicación conecta de forma directa a la instancia PostgreSQL en LXC 820.
- **Protocolo de Rotación y Reinicio Progresivo**: Las rotaciones de credenciales en Vault se sincronizan hacia `v1/Secret pokemon-secrets` en runtime a través de ESO (`refreshInterval: 1h`). Para refrescar las credenciales inyectadas en los pods en ejecución sin necesidad de un controlador daemon pesado, el operador ejecuta un reinicio progresivo ordenado mediante [`scripts/k8s-rollout-restart.ts`](../../scripts/k8s-rollout-restart.ts) o el comando canónico:

  ```bash
  task k8s:restart
  ```

### 3. Cloud Blueprint Inactivo (ADR-030)

El blueprint cloud para producción (actualmente inactivo) establece las pautas de arquitectura para despliegues elásticos y de alta concurrencia:

- **Contrato de Recarga Dinámica con Stakater Reloader**: Todo recurso `Deployment` que consuma secretos incorpora declarativamente la anotación:

  ```yaml
  annotations:
    reloader.stakater.com/auto: "true"
  ```

  Al mutar el recurso `v1/Secret` sincronizado por ESO, el controlador Reloader detecta la mutación y provoca un *RollingUpdate* ordenado del Deployment Controller, respetando PodDisruptionBudgets ([ADR-014](./ADR-014-elastic-autoscaling-hpa-and-pod-disruption-budget.md)) y Graceful Shutdown ([ADR-015](./ADR-015-pod-lifecycle-graceful-shutdown-and-probes.md)).
- **Amortiguación con PgBouncer**: En este perfil distribuido ([ADR-011](./ADR-011-persistence-drizzle-orm-and-pgbouncer.md)), PgBouncer actúa como capa de multiplexación de conexiones a base de datos, absorbiendo la reconexión durante la rotación de contraseñas de PostgreSQL sin cortes para los clientes de API.
- **Backend de Secretos Agnóstico**: Parametrizado mediante `ClusterSecretStore` en `values.prod.yaml` para consumir la ruta `pokedex/prod` contra Vault Cloud o proveedores nativos (AWS Secrets Manager, GCP Secret Manager, Azure Key Vault).

### 4. Tolerancia a Fallos e Invalidación de Sesiones

- **Credenciales Transaccionales (PostgreSQL / Redis)**: Las mutaciones de secretos se aplican sin degradación de lecturas gracias al orden progresivo de los pods en los reinicios.
- **Sesiones Administrativas**: El sistema de autenticación de doble capa ([ADR-010](./ADR-010-authentication-and-session-management.md)) soporta la invalidación distribuida en Redis (`jti`), forzando la re-emisión segura de tokens de sesión tras la rotación de `ADMIN_SESSION_SECRET`.

---

## Consecuencias

### Positivas

- **Cero Secretos en Claro en Git**: Aislamiento estricto por ambiente y eliminación total de vectores de fuga en el control de versiones.
- **Claridad de Roles Operacionales**: Delimitación explícita entre el perfil Lean on-premise (reinicio progresivo explícito sin overhead de daemons) y el blueprint Cloud (recarga reactiva automatizada).
- **Blast Radius Nulo**: Separación física y lógica estricta entre las rutas de secretos (`preprod` on-premise vs. `prod` cloud).
- **Gobernanza y Cumplimiento Continuo**: Gate de auditoría estática fail-closed en CI/CD que previene la degradación de configuraciones de rotación.
- **Almacenamiento Raft Cifrado**: Persistencia transaccional de Vault CE con custodia criptográfica en reposo.

### Compensaciones y Mitigaciones

- **Custodia de Llaves Shamir**: Requiere la custodia segura de las 5 llaves Shamir (umbral de 3 requerido para unseal tras reinicio del host Proxmox). Mitigado con el playbook automatizado [`setup_vault.yaml`](../../infra/ansible/playbooks/setup_vault.yaml) y la guarda de idempotencia en disco.
- **Reinicio Operacional en Pre-producción**: La ausencia de Stakater Reloader en Proxmox exige ejecutar `task k8s:restart` tras una rotación de emergencia en Vault para forzar la actualización inmediata en memoria.
- **Revocación de Sesiones Administrativas**: La rotación de `ADMIN_SESSION_SECRET` revoca sesiones administrativas activas; se mitiga documentando la ventana de mantenimiento y avisos a operadores en [`docs/operations/secret-rotation.md`](../operations/secret-rotation.md).

---

## Contexto Histórico y Retrospectiva

- **Consolidación de ADR-022**: Este registro absorbe y consolida formalmente las definiciones de ADR-022 (archivado, ver [catálogo de decisiones](./README.md#registro-histórico-de-decisiones-consolidadas-o-retiradas)), integrando el contrato de anotaciones de Stakater Reloader (`reloader.stakater.com/auto`), el intervalo acotado de refresco (`refreshInterval: 1h`) y el gate de auditoría estática.
- **Evolución post-ADR-030 (Modelo de Entornos)**: La eliminación de la antigua máquina virtual de producción en Proxmox retiró los roles y stores obsoletos on-premise (`pokedex-prod-role` y `ClusterSecretStore/vault-backend`). La ruta `pokedex/prod` quedó reservada exclusivamente para el blueprint cloud inactivo.
- **Retiro de Bitnami Sealed Secrets**: La solución previa basada en Sealed Secrets (`scripts/seal-secret.ts`) fue desmantelada en favor del flujo nativo y desacoplado provisto por External Secrets Operator (ESO).
