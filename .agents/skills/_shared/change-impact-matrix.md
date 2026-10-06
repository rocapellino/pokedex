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
| **Helm Values (`infra/helm/pokedex/values.yaml`)** | Entornos GitOps (`gitops/environments/`); Release metadata (`Chart.yaml`); Documentación de configuración | Validar si el cambio altera defaults contractuales o requiere alineación en Proxmox o en el blueprint cloud. |
| **Imagen Docker / Código (`apps/backend`, `apps/frontend`)** | CI/CD (`.github/workflows/ci.yaml`); Registry GHCR; Digest SHA256 inmutable; `verify-image-digest-parity.ts`; Release tag | Toda mutación en código fuente altera el digest OCI. Se requiere compilación, firma Cosign y posterior promoción hacia GitOps. |
| **Digest Pinning (`infra/` o `gitops/`)** | Paridad entre entornos (`Cloud == Proxmox == Helm Prod`); Política Kyverno de firmas Cosign | La paridad interna entre entornos debe mantenerse estrictamente 1:1 en producción para evitar drift de versión. |
| **Secretos / Credenciales** | HashiCorp Vault (`setup_vault.yaml`); ExternalSecrets (`ClusterSecretStore`); Secret paths (`pokedex/preprod` operativo; `pokedex/prod` reservado al blueprint prod cloud inactivo, ADR-030); Values de entorno; Runbook de rotación | No almacenar secretos en Git. Verificar mapeo en Vault, sincronización de ESO y necesidad de `rollout restart` ante ausencia de Reloader. |
| **Backup & Disaster Recovery** | Manifiestos de backup (`backup-cronjob.yaml`, `backup-gdrive-cronjob.yaml`); Persistencia (PVC / HostPath); Runbooks de DR (`DISASTER_RECOVERY_PLAN.md`); E2E DR Drill (`dr:drill:e2e`) | Validar cifrado AES-256, checksum SHA-256, exclusiones de red (Cilium FQDN) y scripts de verificación de restore. |
| **Políticas de Red (NetworkPolicies / Cilium)** | Conectividad Egress L7 FQDN; Bloqueo Anti-SSRF (IMDS / RFC1918); Test de seguridad (`tests/security/egress_anti_ssrf.test.ts`); Sonda activa (`probe:security:egress`) | Toda modificación en destinos externos (ej. APIs de Google) requiere actualizar tanto la lista FQDN de Cilium como la regla de salida en standard NetworkPolicy. |
| **Workflows de CI/CD (`.github/workflows/`)** | Permisos OIDC de menor privilegio; Tareas en `Taskfile.yaml`; Scripts de validación en `scripts/`; Quality Gates | Evitar redundancia entre jobs; garantizar que todo script invocado en CI cuente con validación equivalente local en Taskfile. |
| **Proxy web (`apps/frontend/nginx.conf.template`)** | `apps/frontend/nginx.conf` (`nginx:conf:check`); rutas del backend (`apps/backend/src/routes/`); `docker-compose*.yaml`; Ingress de cada entorno | El mismo template sirve compose y Kubernetes. Todo `rewrite`, `location` o `add_header` exige el trazado de rutas (`/repo-architecture route-trace`) en ambos modos. |
| **Ingress por entorno (`ingress.*` en values)** | `className` del entorno; anotaciones compatibles con ese controlador; `tls`; cookies `Secure` y HSTS del backend; ADR-016 | Una anotación renderizada no es efectiva si el controlador del entorno no la interpreta ([methodology.md](methodology.md) §1). Verificar la configuración efectiva por entorno, no el chart base. |
| **ADR consolidado, retirado o renombrado (`docs/decisions/`)** | `docs/decisions/README.md`; `.agents/**`; `AGENTS.md`; `docs/**`; comentarios en código y tests que citen el ADR | Aplicar la regla de referencias inversas (§1.1). La consolidación de ADR-022 (#483) dejó un enlace roto en una skill. |
| **Skills y reglas de agente (`.agents/**`, `AGENTS.md`)** | `.agents/README.md`; catálogo de `AGENTS.md`; tests de gobernanza (`tests/doc_governance.test.ts`, `tests/aas_governance.test.ts`); `docs:validate` | Las skills enlazan las fuentes de verdad; no copian versiones, UIDs ni nombres de archivo volátiles. |

### 1.1 Regla de Referencias Inversas

Todo cambio que **renombre, mueva, consolide o elimine** un archivo, script, tarea de Taskfile, ADR o variable de entorno debe buscar quién lo referencia en **todo** el repositorio antes de cerrarse:

```bash
git grep -n "<nombre-o-ruta-anterior>" -- . ':!docs/audits/'
```

- El alcance incluye `.agents/**` y `AGENTS.md`, no solo `docs/`.
- `docs/audits/` se excluye: es evidencia histórica inmutable.
- Cada coincidencia se corrige o se justifica en el PR. `npm run docs:validate` cubre los enlaces Markdown, pero no las menciones en texto plano ni en código.

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
4. **Entorno Aislado:** Si un cambio aplica únicamente al perfil on-premise Proxmox (ej. `gitops/environments/proxmox-preprod/values.yaml`), **no debe modificarse el perfil prod cloud** (`gitops/environments/cloud/values.yaml`).
   > [!NOTE]
   > El perfil prod cloud es la cadena `values.yaml` → `infra/helm/pokedex/values.prod.yaml`
   > → `gitops/environments/cloud/values.yaml` (`app-cloud.yaml`, blueprint inactivo de
   > ADR-030). Un cambio en `values.prod.yaml` afecta a ese blueprint; el override `cloud`
   > solo declara los puntos de variación del proveedor.

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
| **Proxy Web / Ingress** | `apps/frontend/nginx.conf.template`, `ingress.*` en values | `repo-architecture` (`route-trace`), `repo-security` | `npm run nginx:conf:check`, `helm template` por entorno, trazado de rutas | Fuzzing, migraciones DB |
| **Documentación Pura** | `docs/`, `*.md` | `repo-docs` | `npm run lint:md -- <archivos>` (**0 errores `MDxxx`**), `npm run docs:validate` | Builds de código, tests unitarios, Docker builds, scans |
| **Skills y Reglas de Agente** | `.agents/**`, `AGENTS.md` | `repo-docs`, `repo-lifecycle` (catálogo de skills) | `npm run lint:md -- <archivos>`, `npm run docs:validate`, tests de gobernanza de skills | Builds de código, Docker builds, scans |
| **Archivos de Exclusión (`*.ignore`)** | `.*ignore`, `**/*ignore*` | `repo-lifecycle`, `repo-security`, `repo-quality` | `npm run validate`, verificación de consistencia cruzada | Ninguno |
| **Corte de Release** | `package.json` (bump), `Chart.yaml`, GitOps pins | `repo-release`, `repo-security` (Supply Chain), `repo-docs` | Suite completa (`npm run validate`), firma Cosign, SBOM, paridad 1:1 de ArgoCD | Ninguno (Full Gate Obligatorio) |

> [!IMPORTANT]
> La tabla anterior enumera los **gates y skills a ejecutar**, no el disparador del
> motor determinista. Son dos cosas distintas y confundirlas produce radios de impacto
> sobreestimados:
>
> - **Gates ejecutados:** un cambio en `.*ignore` dispara `npm run validate` y la
>   verificación de consistencia cruzada, con `repo-lifecycle`, `repo-security` y
>   `repo-quality` como skills responsables.
> - **Disparador del motor:** ningún archivo `.*ignore` figura en `global.paths` de
>   [`.github/ci-impact.yaml`](../../../.github/ci-impact.yaml). Cada uno se clasifica
>   **por dominio**: `.dockerignore` corresponde a la regla `docker` y
>   `.markdownlintignore` a la regla `documentation`. `scripts/**` tampoco es global en
>   bloque; los scripts se clasifican de forma individual.
>
> Ante un patrón de exclusión no clasificado aplica la **política fail-closed**: se
> inhibe la optimización y se despacha Full CI.
