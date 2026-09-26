# Matriz de Impacto de Cambios (Change Impact Analysis Matrix)

Este documento define el radio de impacto esperado y la cascada de dependencias cuando se introducen modificaciones en `rocapellino/pokedex`.

> [!IMPORTANT]
> **Regla Permanente de Evaluación de Impacto Documental:**
> **Toda modificación de arquitectura, herramienta, workflow, comando, infraestructura o proceso debe disparar obligatoriamente una evaluación de impacto documental.**
> Ningún cambio se considerará listo para Pull Request si introduce referencias huérfanas, describe herramientas retiradas o genera discrepancias fácticas entre la documentación y el estado real del repositorio.

---

## 1. Cascada de Impacto por Componente

| Tipo de Cambio | Componentes que Obligatoriamente Deben Revisarse | Justificación / Criterio de Propagación |
| :--- | :--- | :--- |
| **Helm Templates (`infra/helm/pokedex/templates/`)** | `infra/helm/pokedex/values.yaml`; `gitops/environments/*/values.yaml`; `tests/` (render tests); Documentación (`docs/architecture/`) | Si se añade un nuevo recurso o parámetro condicional (`if .Values.x`), debe existir un valor seguro por defecto en `values.yaml` y verificarse si los entornos activos lo sobrescriben. |
| **Helm Values (`infra/helm/pokedex/values.yaml`)** | Entornos GitOps (`gitops/environments/`); Release metadata (`Chart.yaml`); Documentación de configuración | Validar si el cambio altera defaults contractuales o requiere alineación en Proxmox / AWS. |
| **Imagen Docker / Código (`apps/backend`, `apps/frontend`)** | CI/CD (`.github/workflows/ci.yml`); Registry GHCR; Digest SHA256 inmutable; `verify-image-digest-parity.ts`; Release tag | Toda mutación en código fuente altera el digest OCI. Se requiere compilación, firma Cosign y posterior promoción hacia GitOps. |
| **Digest Pinning (`infra/` o `gitops/`)** | Paridad entre entornos (`AWS == Proxmox == Helm Prod`); Política Kyverno de firmas Cosign | La paridad interna entre entornos debe mantenerse estrictamente 1:1 en producción para evitar drift de versión. |
| **Secretos / Credenciales** | HashiCorp Vault (`setup_vault.yml`); ExternalSecrets (`ClusterSecretStore`); Secret paths (`pokedex/prod`, `pokedex/preprod`); Values de entorno; Runbook de rotación | No almacenar secretos en Git. Verificar mapeo en Vault, sincronización de ESO y necesidad de `rollout restart` ante ausencia de Reloader. |
| **Backup & Disaster Recovery** | Manifiestos de backup (`backup-cronjob.yaml`, `backup-gdrive-cronjob.yaml`); Persistencia (PVC / HostPath); Runbooks de DR (`DISASTER_RECOVERY_PLAN.md`); E2E DR Drill (`dr:drill:e2e`) | Validar cifrado AES-256, checksum SHA-256, exclusiones de red (Cilium FQDN) y scripts de verificación de restore. |
| **Políticas de Red (NetworkPolicies / Cilium)** | Conectividad Egress L7 FQDN; Bloqueo Anti-SSRF (IMDS / RFC1918); Test de seguridad (`tests/security/egress_anti_ssrf.test.ts`); Sonda activa (`probe:security:egress`) | Toda modificación en destinos externos (ej. APIs de Google) requiere actualizar tanto la lista FQDN de Cilium como la regla de salida en standard NetworkPolicy. |
| **Workflows de CI/CD (`.github/workflows/`)** | Permisos OIDC de menor privilegio; Tareas en `Taskfile.yml`; Scripts de validación en `scripts/`; Quality Gates | Evitar redundancia entre jobs; garantizar que todo script invocado en CI cuente con validación equivalente local en Taskfile. |

---

## 2. Ejemplos Típicos de Flujo de Cambio

### Flujo A: Cambio de Imagen de Backend

```text
Código modificado en apps/backend/
    │
    ▼
Compilación & Tests locales (task build && npm test)
    │
    ▼
Push a rama / PR -> CI ejecuta tests, lint y empaqueta imagen
    │
    ▼
Publicación en GHCR con Digest SHA256 inmutable + Firma Cosign
    │
    ▼
Generación de Release Tag (vX.Y.Z)
    │
    ▼
Actualización de GitOps (scripts/update-gitops-pin.ts)
    │
    ▼
Reconciliación de ArgoCD en clúster
```

### Flujo B: Cambio en Estrategia de Backup

```text
Template de backup o script modificado
    │
    ▼
Revisar si impacta persistencia (PVC) o dependencias externas (Rclone / Google Drive)
    │
    ▼
Revisar NetworkPolicies (requerimiento de FQDN para sync remoto)
    │
    ▼
Ejecutar prueba de simulacro E2E (dr:drill:e2e)
    │
    ▼
Alinear valores en gitops/environments/ y documentar estado por entorno
```

---

## 3. Criterios de Justificación para No Modificar Componentes

No todos los archivos de un subsistema deben alterarse ante un cambio. La skill debe certificar que un componente **NO** requiere actualización cuando se cumplan las siguientes condiciones:

1. **Desacoplamiento Contractual:** Si un cambio en el backend no altera esquemas Zod ni contratos de API, **no debe modificarse `apps/frontend/`**.
2. **Promoción Desacoplada de CI:** Si se publica una nueva imagen en CI pero el release actual de producción permanece deliberadamente fijado en un tag anterior, **no debe modificarse `targetRevision` en GitOps** de forma inmediata.
3. **Persistencia Agnóstica:** Si se modifica la programación de un CronJob (`schedule`), pero el volumen PVC y el script de restore permanecen intactos, **no deben modificarse las políticas de almacenamiento ni OpenTofu**.
4. **Entorno Aislado:** Si un cambio aplica únicamente al perfil on-premise Proxmox (ej. `values.yaml`), **no debe modificarse el perfil de AWS (`values.prod.yaml`)**.

---

## 4. Matriz de Gating Condicional por Dominio

La siguiente tabla establece qué Quality Gates y qué skills son **bloqueantes obligatorios** según el dominio tocado por el cambio:

| Tipo de Cambio | Archivos / Rutas Típicas | Skills Obligatorias | Quality Gates Requeridos | Gates Exentos / Omitidos |
| :--- | :--- | :--- | :--- | :--- |
| **Backend Core** | `apps/backend/src/` | `repo-quality`, `repo-testing`, `repo-security` (App) | `npm run lint`, `npm run build:backend`, `npm test` (unit/integración), `test:fuzz` | Playwright E2E UI, Helm render, Terraform/Ansible |
| **Frontend SPA** | `apps/frontend/src/` | `repo-quality`, `repo-testing` | `npm run build:frontend`, `npm run typecheck`, tests unitarios de componentes, Playwright E2E (`tests/e2e/`) | Helm render, Vault rotation, Egress anti-SSRF, Fuzzing |
| **Infraestructura Helm** | `infra/helm/` | `repo-architecture`, `repo-release`, `repo-security` | `helm lint`, `gitops:verify-parity:strict`, validación de templates AST | Backend unit tests, Playwright UI tests |
| **GitOps Declarativo** | `gitops/` | `repo-architecture`, `repo-release` | `gitops:pin:check`, `gitops:verify-parity:strict` | Pruebas de fuzzing, frontend build |
| **Plataforma / Ansible / OpenTofu** | `infra/ansible/`, `infra/opentofu/` | `repo-architecture`, `repo-security` (K8s/Vault) | `secrets:audit-rotation`, linter de Ansible/Tofu | Frontend builds, backend unit tests |
| **Workflows de CI/CD** | `.github/workflows/` | `repo-ci`, `repo-security` (CI) | Validación sintáctica YAML, auditoría de permisos de tokens (`permissions:`) | Pruebas E2E de navegador, migraciones DB |
| **Dependencias Monorepo** | `package.json`, `package-lock.json` | `repo-dependencies`, `repo-security` (SCA), `repo-testing` | `npm audit`, `npm test`, paridad de lockfile | Helm render, Playwright E2E (salvo si toca deps de browser) |
| **Documentación Pura** | `docs/`, `*.md` | `repo-docs` | `npm run lint:md -- <archivos>` (**0 errores `MDxxx`**) | Builds de código, tests unitarios, Docker builds, scans |
| **Enmienda de ADR** | `docs/decisions/` | `repo-architecture`, `repo-docs` | `npm run lint:md`, validación cruzada con `source-of-truth.md` | Validación de clúster, builds de frontend |
| **Corte de Release** | `package.json` (bump), `Chart.yaml`, GitOps pins | `repo-release`, `repo-security` (Supply Chain), `repo-docs` | Suite completa (`npm run validate`), firma Cosign, SBOM, paridad 1:1 de ArgoCD | Ninguno (Full Gate Obligatorio) |
