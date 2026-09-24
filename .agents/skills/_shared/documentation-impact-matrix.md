# Matriz de Impacto en Documentación (Documentation Impact Matrix)

Este documento define la relación obligatoria entre los cambios introducidos en el código o infraestructura y los documentos técnicos que deben revisarse para prevenir el fenómeno de *Documentation Drift*.

---

## 1. Mapeo de Dominios Modificados a Documentación Afectada

| Dominio Modificado | Rutas Típicas de Cambio | Documentación que Obligatoriamente Debe Revisarse | Racional de Actualización |
| :--- | :--- | :--- | :--- |
| **Nuevo Componente o Servicio** | `apps/backend/src/services/`, `apps/frontend/src/` | `docs/architecture/ARCHITECTURE_SPECIFICATION.md`; `README.md`; Runbooks operativos pertinentes | Documentar propósito, interfaces expuestas, contratos de datos y procedimientos de troubleshooting. |
| **Cambio de Arquitectura / Contrato** | `apps/backend/src/routes/`, refactorización mayor | `docs/decisions/` (ADR nuevo o enmienda); `docs/architecture/APPLICATION_LIFECYCLE.md`; `docs/api/` | Mantener vigencia de decisiones formales y evitar divergencia entre diseño declarado e implementado. |
| **Backup & Disaster Recovery** | `infra/helm/pokedex/templates/backup*`, `scripts/dr*` | `docs/runbooks/DISASTER_RECOVERY_PLAN.md`; `docs/operations/GDRIVE_BACKUP_GUIDE.md`; `docs/decisions/ADR-006-*.md` | Actualizar topología de respaldo, comandos de restore, cronogramas de retención y estado por entorno. |
| **Secretos, Vault & ESO** | `setup_vault.yml`, `externalSecrets` en values | `docs/operations/secret-rotation.md`; `docs/security/`; `docs/architecture/VAULT_PROXMOX_ARCHITECTURE.md` | Actualizar rutas en Vault (`pokedex/prod`), políticas de acceso y procedimientos de rotación. |
| **Despliegue & GitOps** | `gitops/apps/*.yaml`, `gitops/environments/*/values.yaml` | `docs/architecture/GITOPS_PROMOTION_WORKFLOW.md`; `docs/operations/deployment.md` | Documentar nuevo `targetRevision`, cambios en SyncWindows o parámetros de entornos activos. |
| **Pipelines CI/CD** | `.github/workflows/*.yml`, `Taskfile.yml` | `docs/devops/`; `docs/operations/TASKFILE_CLI_REFERENCE.md`; `README.md` | Mantener sincronizados los comandos locales soportados y los jobs obligatorios de integración continua. |
| **Herramientas de Plataforma** | Incorporación o cambio de herramienta (ej. Rclone, Syft) | `docs/decisions/` (ADR formal); `docs/operations/`; `README.md` | Explicar el racional de selección, seguridad de supply chain (digest pinning) y runbook de uso. |

---

## 2. Criterios de Justificación para No Modificar Documentación

Para evitar actualizaciones innecesarias o ruido en Pull Requests, un documento **NO** requiere modificación si se cumple alguna de las siguientes condiciones justificables:

1. **Refactorización Interna sin Cambio de Contrato:**
   Si se optimiza una función o se extrae un módulo utilitario sin alterar endpoints HTTP, esquemas Zod, flags de configuración ni variables de entorno, **no se requiere actualizar `docs/api/` ni `docs/architecture/`**.
2. **Corrección de Linter o Formato:**
   Ajustes estéticos, ordenamiento de imports o resolución de reglas de tipado que no alteran la semántica operativa **no impactan la documentación**.
3. **Modificación Específica de Entorno Local:**
   Cambios aislados en `docker-compose.dev.yml` o scripts de simulación de pruebas que no alteran la arquitectura de producción on-premise ni cloud **no demandan actualizar los runbooks de producción**.
4. **Documento Histórico Delimitado:**
   Auditorías fechadas bajo `docs/audits/<fecha>/` son registros inmutables de estados pasados; **nunca deben modificarse retroactivamente** para reflejar cambios presentes.
