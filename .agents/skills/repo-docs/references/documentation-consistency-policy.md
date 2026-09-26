# Política de Consistencia y Validación Cruzada (Documentation Consistency Policy)

Este documento define la metodología de validación cruzada fáctica entre la documentación técnica y las capas operativas del repositorio `rocapellino/pokedex`.

---

## 1. Matriz de Validación Cruzada Multicapa

La evaluación documental no puede limitarse a analizar la sintaxis de archivos `.md`. Toda afirmación debe someterse a prueba contrastando la documentación contra el estado real del repositorio:

```text
                     ┌──────────────────┐
                     │  DOCUMENTACIÓN   │
                     └────────┬─────────┘
                              │ Cruce Fáctico Obligatorio
       ┌───────────┬──────────┼──────────┬───────────┐
       ▼           ▼          ▼          ▼           ▼
   ┌───────┐  ┌─────────┐  ┌───────┐  ┌──────┐  ┌─────────┐
   │CÓDIGO │  │ CONFIG  │  │ CI/CD │  │ IaC  │  │ GITOPS  │
   │ apps/ │  │ .env.*  │  │.github│  │infra/│  │ gitops/ │
   └───────┘  └─────────┘  └───────┘  └──────┘  └─────────┘
```

| Capa del Repositorio | Fuente de Evidencia en Disco | Regla de Consistencia Documental |
| :--- | :--- | :--- |
| **Código Backend** | `apps/backend/src/` | Todo endpoint, middleware, modelo Drizzle o servicio documentado debe coincidir con el código fuente. |
| **Código Frontend** | `apps/frontend/src/` | Rutas, vistas, componentes de interfaz y lógica de proxy Nginx deben coincidir con la implementación SPA. |
| **Configuración** | `config/`, `.env.example`, variables | Las variables de entorno documentadas deben existir en esquemas de validación (ej. Zod) y en `.env.example`. |
| **CI/CD** | `.github/workflows/*.yml` | Los jobs, nombres de workflows, triggers y pasos documentados deben reflejar exactamente la configuración de GitHub Actions. |
| **IaC y Plataforma** | `infra/opentofu/`, `infra/ansible/` | Recursos de OpenTofu, playbooks de Ansible y roles declarados deben corresponder a archivos reales en disco. |
| **Helm Packaging** | `infra/helm/pokedex/` | Las plantillas, parámetros de `values.yaml` y la metadata de `Chart.yaml` deben alinearse con las guías de despliegue. |
| **GitOps Delivery** | `gitops/apps/`, `gitops/environments/` | El estado de promoción (`targetRevision`), rutas de valores y Clusters deben reflejarse fidedignamente. |
| **Superficie CLI** | `Taskfile.yml`, `package.json` | Los comandos y tareas documentadas para operadores y desarrolladores deben ser ejecutables en el sistema. |
| **Skills de Agentes** | `.agents/skills/` | Las reglas de gobernanza, nombres de skills y matrices de impacto deben mantener coherencia terminológica. |

---

## 2. Reglas de Detección de Referencias Huérfanas (`ORPHANED_REFERENCE`)

Se considera una **referencia huérfana** todo enlace, mención o fragmento documental que cite un artefacto inexistente en el árbol activo de `main`.

### Catálogo de Comprobaciones Automatizables

1. **Archivos o Directorios Inexistentes:**
   - La documentación cita una ruta relativa o absoluta inexistente en el filesystem (ej. `docs/foo/bar.md` o `src/legacy/`).
   - Severidad: **P1/P2** según criticidad operativa.
2. **Scripts Retirados o Eliminados:**
   - Referencias a scripts borrados tras refactors o migraciones de arquitectura (ej. scripts históricos de sellado de secretos como `scripts/seal-secret.ts`, `scripts/seal_secret.sh`, `scripts/seal_secret.py`).
   - Severidad: **P1**. Acción: Eliminación inmediata de la mención o actualización al script canónico.
3. **Comandos o Targets de CLI Inexistentes:**
   - Documentación de tareas de Taskfile retiradas tras hitos de depreciación (ej. aliases legados como `task ts:install`, `task tofu:init:proxmox` eliminados en Fase 4 de ADR-026).
   - Documentación de scripts npm ausentes en `package.json`.
   - Severidad: **P2**. Acción: Sustituir por la tarea canónica vigente (`task install`, `task infra:validate`).
4. **Variables de Entorno Retiradas:**
   - Menciones a variables que ya no son leídas por el runtime de la aplicación ni por los manifiestos de Helm.
   - Severidad: **P2**. Acción: Retiro de runbooks y guías de configuración.
5. **Herramientas o Componentes Arquitectónicos Reemplazados:**
   - Textos que presentan herramientas superadas (ej. Bitnami Sealed Secrets frente a HashiCorp Vault CE + ESO) como parte activa de la pila tecnológica en producción.
   - Severidad: **P1**. Acción: Actualización al SSOT arquitectónico vigente.

---

## 3. Reglas de Detección de Desacople de Versiones (`VERSION_MISMATCH`)

La documentación debe sincronizarse con el versionado operacional del repositorio:

```text
package.json ("version": "X.Y.Z")
Chart.yaml ("version": "X.Y.Z", "appVersion": "X.Y.Z")
GitOps Apps ("targetRevision": "vX.Y.Z")
Git Tags ("vX.Y.Z")
                ↕
Documentación y Guías Operativas
```

### Reglas de Evaluación

1. **Alineación de Versión Canónica:** Si la documentación declara que el sistema se encuentra en una versión específica (ej. `v1.76.0`) pero `package.json`, `Chart.yaml` o los pines de GitOps ya han sido promovidos a una versión superior (ej. `v1.78.3`), se genera un hallazgo `VERSION_MISMATCH`.
2. **Diferenciación entre Histórico y Desacople:**
   - Las auditorías fechadas previas (`docs/audits/YYYY-MM-DD/`) están exentas de actualización de versión, ya que constituyen evidencia del hito pasado.
   - Guías operativas, runbooks de despliegue, matrices de responsabilidad y `README.md` deben actualizarse para reflejar el release activo.
3. **Declaración en Políticas de Soporte:** La política de soporte en `SECURITY.md` debe alinearse siempre con la rama de versiones operativas del repositorio (ej. soporte a series `v1.x` activas y declaración explícita de versiones EOL).
