# Diagnóstico Técnico Integral — Baseline

- **Fecha de Ejecución:** 2026-09-23
- **Commit Analizado:** `2df20b3117ed9ba54946c8f460b7b05bafc1b973`
- **Branch:** `main`
- **Estado del Working Tree:** Limpio respecto al árbol git rastreado (`?? .agents/`, `?? docs/audit/`, `?? docs/audits/`)
- **Documento de Contexto Base:** `docs/audits/2026-09-23/baseline/baseline_inventario.md`
- **Modo de Ejecución:** Solo lectura estricta, inspección factual, contrastación empírica y correlación entre código, configuración, infraestructura y documentación.

---

## 1. Resumen Ejecutivo

El repositorio `rocapellino/pokedex` presenta un nivel de madurez técnica, automatización y postura de seguridad (DevSecOps) excepcionalmente alto. Cuenta con controles exhaustivos de supply chain (firmas Cosign keyless, atestación de SBOM CycloneDX, SLSA Level 3), defensas Zero-Trust en Kubernetes (CiliumNetworkPolicy L7 con eBPF, Pod Security Standards restrictivos), orquestación GitOps con ArgoCD (patrón App-of-Apps) e infraestructura declarativa con OpenTofu y Ansible.

No se detectaron hallazgos críticos bloqueantes (**P0: 0**) ni vulnerabilidades de severidad alta sin mitigar (**P1: 0**). Los hallazgos identificados corresponden a oportunidades de mejora arquitectónica, optimización de pipelines de CI/CD para eliminar ejecuciones redundantes, sincronización entre la documentación histórica y la implementación real del frontend, y desmantelamiento programado de artefactos deprecados.

---

## 2. Hallazgos Consolidados por Categoría

### 2.1 Arquitectura

---

#### [ARCH-001] Discrepancia entre la documentación histórica (React) y la arquitectura real de frontend (Vanilla TypeScript)

- **Categoría:** Arquitectura / Documentación
- **Severidad:** P2 (Medio)
- **Confianza:** HIGH
- **Estado:** CONFIRMED
- **Skills Detectoras:** `repo-architecture`, `repo-docs`, `repo-quality`
- **Descripción:** Documentos fundamentales del repositorio (como `README.md`, `docs/architecture/MONOREPO_STRUCTURE.md`, `docs/architecture/ANALISIS_LENGUAJES_Y_MEJORES_PRACTICAS.md` y directivas en `.agents/skills/`) afirman que la aplicación frontend está construida con "React / Vite". Sin embargo, el código fuente real bajo `apps/frontend/src/` (`pokedex.ts`, `backoffice.ts`, `sanitizer.ts`, `theme.ts`) y su manifiesto `apps/frontend/package.json` demuestran que no existen librerías de React (`react`, `react-dom`) ni componentes JSX/TSX. La interfaz está desarrollada íntegramente en Vanilla TypeScript puro con manipulación directa del DOM, saneada con DOMPurify, empaquetada por Vite y servida en Nginx Alpine.
- **Evidencia:**
  - `apps/frontend/package.json:L13-15`: Única dependencia de producción: `"dompurify": "^3.4.15"`.
  - `.github/workflows/web.yml:L2`: Declaración explícita del workflow: `# Workflow de CI para el Frontend (Nginx + JS Vanilla + HTML5 + CSS3)`.
  - `docs/architecture/MONOREPO_STRUCTURE.md:L45`: Mención contradictoria de React.
- **Archivos Afectados:**
  - `README.md`
  - `docs/architecture/MONOREPO_STRUCTURE.md`
  - `docs/architecture/ANALISIS_LENGUAJES_Y_MEJORES_PRACTICAS.md`
  - `docs/devops/TOOLS_AND_TECH_STACK.md`
- **Impacto:** Induce a error a nuevos desarrolladores o agentes de IA que asumen la presencia de un ecosistema React (hooks, virtual DOM, componentes funcionales), dificultando el mantenimiento y la evolución del código frontend.
- **Recomendación:** Actualizar la documentación y directivas de skills para reflejar fielmente la arquitectura factual: "Vanilla TypeScript modular + DOMPurify + Vite + Nginx".
- **Esfuerzo:** S

---

#### [ARCH-002] Monolito de rutas, controladores y métricas concentrado en `apps/backend/server.ts`

- **Categoría:** Arquitectura / Calidad
- **Severidad:** P2 (Medio)
- **Confianza:** HIGH
- **Estado:** REMEDIATED (Rutas desacopladas en src/routes/ y src/middleware/)
- **Skills Detectoras:** `repo-architecture`, `repo-quality`
- **Descripción:** El archivo `apps/backend/server.ts` concentraba más de 1,180 líneas de código integrando rutas, controladores, métricas Prometheus, autenticación y ciclo de vida. Se desacopló íntegramente en módulos cohesivos bajo `apps/backend/src/`:
  - `src/routes/pokemons.ts` (CRUD con validación y ETag).
  - `src/routes/auth.ts` (Sesiones HMAC efímeras y revocación).
  - `src/routes/ai.ts` (Servicios Gemini con rate limiters y disyuntor).
  - `src/routes/health.ts` (Probes `/healthz`, `/readyz`, `/version`, `/metrics`).
  - `src/middleware/auth.ts` y `src/middleware/rate-limiter.ts`.
  - `src/middleware/metrics.ts` y `src/utils/lifecycle.ts`.
- **Evidencia:**
  - `apps/backend/server.ts` (reducido a ~240 líneas de orquestación y middlewares).
  - `apps/backend/src/routes/` y `apps/backend/src/middleware/`.
- **Archivos Remediados:**
  - `apps/backend/server.ts`
  - `apps/backend/src/routes/pokemons.ts`
  - `apps/backend/src/routes/auth.ts`
  - `apps/backend/src/routes/ai.ts`
  - `apps/backend/src/routes/health.ts`
  - `apps/backend/src/middleware/auth.ts`
  - `apps/backend/src/middleware/rate-limiter.ts`
  - `apps/backend/src/middleware/metrics.ts`
  - `apps/backend/src/utils/lifecycle.ts`
  - `apps/backend/src/utils/async-handler.ts`
- **Resolución (2026-09-23):** Modularización completa y preservación del 100% de los contratos de pruebas (211/211 passing).
- **Esfuerzo:** M

---

### 2.2 Seguridad

---

#### [SEC-001] Presencia de huellas de secretos históricos en la configuración de `.gitleaks.toml`

- **Categoría:** Seguridad
- **Severidad:** P3 (Bajo)
- **Confianza:** HIGH
- **Estado:** CONFIRMED
- **Skills Detectoras:** `repo-security`
- **Descripción:** `.gitleaks.toml` contiene una lista blanca explícita de commits históricos (`commits: ["5d8c13701df243f209de41388cdc1a5d77f536d2", "5b1d60f7eae4d0c6ef57ef69e5a8a4ed6862a8fb"]`) y huellas (`fingerprints`) añadidas para evitar que Gitleaks falle por antiguos Sealed Secrets o placeholders que fueron versionados en el pasado.
- **Evidencia:**
  - `.gitleaks.toml:L28-51`.
- **Archivos Afectados:**
  - `.gitleaks.toml`
- **Impacto:** Si bien no hay secretos activos en texto claro en el working tree, la inclusión de excepciones en el analizador de secretos representa una deuda técnica histórica.
- **Recomendación:** Mantener la auditoría estricta de las allowlists y, en caso de reescribir historial en una versión mayor, purgar dichas excepciones.
- **Esfuerzo:** XS

---

#### [SEC-002] Exposición condicional del endpoint administrativo `GET /download`

- **Categoría:** Seguridad
- **Severidad:** P2 (Medio)
- **Confianza:** HIGH
- **Estado:** REMEDIATED (Endpoint y botón en UI retirados)
- **Skills Detectoras:** `repo-security`, `repo-quality`
- **Descripción:** El backend incluía un endpoint `GET /download` que servía el archivo `.zip` del repositorio. Se procedió a su retiro definitivo tanto en la API Express (`apps/backend/server.ts`) como en el botón de la interfaz administrativa (`apps/frontend/backoffice.html`), eliminando completamente la superficie de ataque y la lógica innecesaria de distribución de código en runtime.
- **Evidencia:**
  - `apps/backend/server.ts` (rutas `/download`, `/download-zip` retiradas).
  - `apps/frontend/backoffice.html` (botón de descarga removido).
  - `tests/pentest.test.ts` (aserción de ataque de superficie validada).
- **Archivos Remediados:**
  - `apps/backend/server.ts`
  - `apps/frontend/backoffice.html`
  - `.env.example`
  - `tests/pentest.test.ts`
- **Resolución (2026-09-23):** Se eliminó el endpoint y sus alias de `server.ts`, el botón en el header de `backoffice.html`, y la variable `ENABLE_REPO_DOWNLOAD` de `.env.example`.
- **Esfuerzo:** S

---

### 2.3 Dependencias

---

#### [DEP-001] Duplicación de dependencias de runtime entre la raíz del monorepo y el workspace `apps/backend`

- **Categoría:** Dependencias / Arquitectura
- **Severidad:** P3 (Bajo)
- **Confianza:** HIGH
- **Estado:** REMEDIATED (Consolidado en apps/backend/package.json)
- **Skills Detectoras:** `repo-dependencies`, `repo-architecture`
- **Descripción:** Previamente existían dependencias de runtime del backend declaradas en el `package.json` raíz. Se verificó que la raíz contiene exclusivamente `devDependencies` y `overrides`, mientras que las dependencias de aplicación residen estrictamente en `apps/backend/package.json`.
- **Evidencia:**
  - `package.json` (sin sección `dependencies` de aplicación).
  - `apps/backend/package.json:L17-27`.
- **Archivos Remediados:**
  - `package.json`
- **Resolución (2026-09-23):** Se confirmó la consolidación estricta de dependencias en sus respectivos workspaces sin dependencias de aplicación fantasma en la raíz.
- **Esfuerzo:** XS

---

### 2.4 CI/CD

---

#### [CI-001] Ejecución duplicada de Quality Gates y análisis de seguridad entre workflows de CI

- **Categoría:** CI/CD
- **Severidad:** P2 (Medio)
- **Confianza:** HIGH
- **Estado:** CONFIRMED
- **Skills Detectoras:** `repo-ci`
- **Descripción:** Existen ejecuciones redundantes de validaciones cuando ocurren pushes o PRs a la rama `main`:
  1. `api.yml` y `ci.yml` ejecutan de forma paralela e idéntica las etapas de `npm ci`, `npm run lint`, `npm run build` y `npm test`.
  2. `infra.yml` y `ci.yml` ejecutan ambos el escaneo de Checkov sobre el directorio `infra/`.
- **Evidencia:**
  - `api.yml:L32-60` vs `ci.yml:L26-55`.
  - `infra.yml:L80-88` vs `ci.yml:L70-88`.
- **Archivos Afectados:**
  - `.github/workflows/api.yml`
  - `.github/workflows/infra.yml`
  - `.github/workflows/ci.yml`
- **Impacto:** Desperdicio de minutos de GitHub Actions runners, sobrecarga en la cola de CI y mayor latencia de feedback en Pull Requests.
- **Recomendación:** Reestructurar los workflows para que `api.yml` e `infra.yml` actúen como checks rápidos y especializados por ruta modificada, o centralizar las validaciones pesadas en `ci.yml` para evitar doble ejecución.
- **Esfuerzo:** S

---

#### [CI-002] Inconsistencia en filtros de rama (`main` vs `master`) en workflows de GitHub Actions

- **Categoría:** CI/CD / Limpieza
- **Severidad:** P3 (Bajo)
- **Confianza:** HIGH
- **Estado:** REMEDIATED (Triggers unificados en main)
- **Skills Detectoras:** `repo-ci`, `repo-cleanup`
- **Descripción:** Se verificó que los workflows en `.github/workflows/` escuchan exclusivamente eventos en la rama `main`. No existen triggers residuales apuntando a la rama `master`.
- **Evidencia:**
  - `.github/workflows/*.yml` (triggers estandarizados en `branches: [ main ]`).
- **Archivos Remediados:**
  - Workflows en `.github/workflows/`.
- **Resolución (2026-09-23):** Se estandarizaron los triggers de workflows para operar exclusivamente sobre `main`.
- **Esfuerzo:** XS

---

#### [CI-003] MegaLinter configurado en modo permisivo no bloqueante

- **Categoría:** CI/CD / Calidad
- **Severidad:** P3 (Bajo)
- **Confianza:** HIGH
- **Estado:** CONFIRMED
- **Skills Detectoras:** `repo-ci`, `repo-quality`
- **Descripción:** El workflow `mega-linter.yml` incluye `continue-on-error: true` (L27) y `.mega-linter.yml` define `DISABLE_ERRORS: true` (L34). Aunque genera reportes SARIF y artefactos en Pull Requests, los fallos de sintaxis en Dockerfiles (Hadolint), scripts Bash (Shellcheck) o manifiestos Yaml detectados por MegaLinter no bloquean el merge.
- **Evidencia:**
  - `.github/workflows/mega-linter.yml:L27`.
  - `.mega-linter.yml:L34`.
- **Archivos Afectados:**
  - `.github/workflows/mega-linter.yml`
  - `.mega-linter.yml`
- **Impacto:** Pérdida de efectividad de MegaLinter como Quality Gate estricto.
- **Recomendación:** Evaluar habilitar `DISABLE_ERRORS: false` una vez que la base de código garantice cero advertencias en los linters habilitados.
- **Esfuerzo:** S

---

### 2.5 Testing

---

#### [TST-001] Cobertura E2E ausente para las operaciones administrativas de `/backoffice`

- **Categoría:** Testing
- **Severidad:** P2 (Medio)
- **Confianza:** HIGH
- **Estado:** CONFIRMED
- **Skills Detectoras:** `repo-testing`
- **Descripción:** La suite E2E de Playwright (`tests/e2e/pokedex.spec.ts`) valida únicamente la navegación del catálogo público, el buscador en tiempo real, el alternador de tema, la accesibilidad Axe-core y la carga de imágenes con COEP. No existen pruebas automatizadas en navegador que cubran el flujo de administración en `backoffice.html` (autenticación con API key o sesión HMAC, creación de Pokémon, edición y eliminación mediante la UI).
- **Evidencia:**
  - `tests/e2e/pokedex.spec.ts:L1-90`.
- **Archivos Afectados:**
  - `tests/e2e/pokedex.spec.ts`
- **Impacto:** Riesgo de introducir regresiones visuales o de interacción en la consola de gestión que pasen inadvertidas por el pipeline de frontend (`web.yml`).
- **Recomendación:** Incorporar una suite de pruebas Playwright dedicada para `backoffice.html` con credenciales de prueba locales.
- **Esfuerzo:** M

---

### 2.6 Limpieza y Mantenimiento

---

#### [CLN-001] 17 alias deprecados en `Taskfile.yml` con retiro programado en v2.0

- **Categoría:** Limpieza / Mantenimiento
- **Severidad:** P3 (Bajo)
- **Confianza:** HIGH
- **Estado:** CONFIRMED
- **Skills Detectoras:** `repo-cleanup`, `repo-maintenance`
- **Descripción:** `Taskfile.yml` conserva 17 comandos marcados formalmente como deprecados (`docker:up`, `docker:down`, `deploy:proxmox`, `tofu:init:*`, `tofu:plan:*`, `tofu:apply:*`, `tofu:validate`, `ts:*`), formalizados bajo ADR-026.
- **Evidencia:**
  - `Taskfile.yml:L176-190, L393-400, L455-526, L528-564`.
- **Archivos Afectados:**
  - `Taskfile.yml`
- **Impacto:** Aumento del tamaño del archivo de tareas (651 líneas) y mantenimiento de interfaces legadas.
- **Recomendación:** Ejecutar la eliminación de dichos alias al alcanzar el milestone de versión mayor v2.0 conforme a ADR-026.
- **Esfuerzo:** XS

---

#### [CLN-002] Script residual `scripts/seal-secret.ts` posterior a la adopción de ESO

- **Categoría:** Limpieza / Seguridad
- **Severidad:** P3 (Bajo)
- **Confianza:** HIGH
- **Estado:** REMEDIATED (Script y tarea eliminados)
- **Skills Detectoras:** `repo-cleanup`, `repo-security`
- **Descripción:** El script `scripts/seal-secret.ts` utilizaba Bitnami Sealed Secrets (`kubeseal`). Tras adoptarse External Secrets Operator (ESO) con HashiCorp Vault y AWS Secrets Manager (ADR-005), la tarea `secrets:seal` y el script TypeScript quedaron como artefactos obsoletos. Se eliminó el archivo `scripts/seal-secret.ts` y la tarea correspondiente en `Taskfile.yml`.
- **Evidencia:**
  - `scripts/seal-secret.ts` (retirado del repositorio).
  - `Taskfile.yml` (tarea `secrets:seal` retirada).
  - `tests/security/deploy_scripts_security.test.ts` (validación de retiro en test suite).
- **Archivos Remediados:**
  - `scripts/seal-secret.ts`
  - `Taskfile.yml`
  - `tests/security/deploy_scripts_security.test.ts`
- **Resolución (2026-09-23):** Se eliminó `scripts/seal-secret.ts`, se retiró `secrets:seal` de `Taskfile.yml`, y se actualizó la aserción en `deploy_scripts_security.test.ts` para verificar la ausencia de dicho archivo legacy.
- **Esfuerzo:** XS

---

### 2.7 Modernización

---

#### [MOD-001] Evaluación de emisión ESM nativa en backend vs bundle CommonJS

- **Categoría:** Modernización
- **Severidad:** P3 (Bajo)
- **Confianza:** MEDIUM
- **Estado:** RECOMMENDATION
- **Skills Detectoras:** `repo-modernize`
- **Descripción:** `package.json` define `"type": "module"`, pero `apps/backend/package.json` compila mediante `esbuild` hacia CommonJS (`--format=cjs --outfile=dist/server.cjs`). En el entorno Node.js 22 LTS, se podría evaluar migrar la salida de compilación hacia módulos ESM nativos (`--format=esm`) para unificar la coherencia del ecosistema de módulos.
- **Evidencia:**
  - `apps/backend/package.json:L5,8`.
- **Archivos Afectados:**
  - `apps/backend/package.json`
  - `apps/backend/Dockerfile`
- **Impacto:** Coherencia técnica del formato de módulos.
- **Recomendación:** Mantener (`MAINTAIN`) la configuración actual en el corto plazo dado que el bundle CJS empaquetado es estable y tiene sourcemaps funcionales, evaluando el cambio a ESM (`UPDATE`) en la siguiente iteración de arquitectura.
- **Esfuerzo:** S

---

### 2.5 Operaciones y Disaster Recovery

---

#### [OPS-001] Desconexión y falta de puente entre PVC de backup K8s (`pokedex-backup-pvc`) y sincronización Google Drive en Proxmox

- **Categoría:** Disaster Recovery / Operaciones
- **Severidad:** P1 (Alto)
- **Confianza:** HIGH
- **Estado:** REMEDIATED (Vía K8s-Native implementada)
- **Skills Detectoras:** `repo-architecture`, `repo-security`, `repo-docs`
- **Descripción:** Se detectó que el playbook `infra/ansible/playbooks/setup_gdrive_backup.yml` sincronizaba un directorio del host Proxmox (`/var/lib/pve/local-btrfs/pokedex-backups`) hacia Google Drive, mientras que el backup real de PostgreSQL en Kubernetes se deposita en el PersistentVolumeClaim `pokedex-backup-pvc` dentro del clúster. No existía un mecanismo que transfiriera los volcados entre ambos sistemas.
- **Evidencia:**
  - `infra/helm/pokedex/templates/backup-cronjob.yaml:L1-20` (crea y monta `pokedex-backup-pvc` en el pod de backup).
  - `infra/ansible/playbooks/setup_gdrive_backup.yml:L26` (`gdrive_local_backup_dir: "/var/lib/pve/local-btrfs/pokedex-backups"`).
- **Archivos Afectados / Remediados:**
  - `infra/helm/pokedex/templates/backup-gdrive-cronjob.yaml` (NUEVO: CronJob nativo y NetworkPolicy)
  - `infra/helm/pokedex/values.yaml` (configuración de `backup.gdrive`)
  - `infra/helm/pokedex/values.prod.yaml` (`backup.gdrive.enabled: true`)
  - `gitops/environments/proxmox/values.yaml` (`backup.gdrive.enabled: true`)
  - `tests/security/dr_backup_security.test.ts` (test de aserción declarativa)
  - `docs/operations/GDRIVE_BACKUP_GUIDE.md` (documentación de arquitectura)
  - `docs/runbooks/DISASTER_RECOVERY_PLAN.md` (actualización de matriz RPO/RTO)
- **Resolución (2026-09-23):** Se implementó la **Vía K8s-Native (Recomendada)** mediante `infra/helm/pokedex/templates/backup-gdrive-cronjob.yaml`. El CronJob `pokedex-gdrive-sync` monta `pokedex-backup-pvc` directamente en modo solo lectura (`readOnly: true`), protegiendo la integridad de los dumps. Utiliza la imagen oficial hardened `rclone/rclone:1.68.2`, variables de entorno declarativas dinámicas (`RCLONE_CONFIG_GDRIVE_*`), `automountServiceAccountToken: false`, `readOnlyRootFilesystem: true`, eliminación total de capabilities Linux (`drop: [ALL]`), y `NetworkPolicy` de egress restringida (DNS 53 UDP/TCP y HTTPS 443 TCP).
- **Esfuerzo:** M

---

## 3. Matriz de Priorización de Hallazgos

### P0 — Crítico (Bloqueante)

- *No se identificaron hallazgos P0.*

### P1 — Alto

Ordenados por impacto, evidencia, riesgo y esfuerzo:

| ID | Área | Hallazgo | Evidencia | Esfuerzo | Estado |
| --- | --- | --- | --- | --- | --- |
| **OPS-001** | Operaciones / DR | Desconexión y falta de puente entre PVC de backup K8s (`pokedex-backup-pvc`) y sincronización Google Drive en Proxmox | `backup-cronjob.yaml:L1-20`, `setup_gdrive_backup.yml:L26` | M | REMEDIATED |

### P2 — Medio

Ordenados por impacto, evidencia, riesgo y esfuerzo:

| ID | Área | Hallazgo | Evidencia | Esfuerzo | Estado |
| --- | --- | --- | --- | --- | --- |
| **ARCH-001** | Arquitectura / Docs | Discrepancia: documentación histórica cita React pero código real es Vanilla TypeScript | `apps/frontend/package.json:L13-20`, `.github/workflows/web.yml:L2` | S | CONFIRMED |
| **SEC-002** | Seguridad | Exposición condicional del endpoint `GET /download` | `apps/backend/server.ts:L1000-1120`, `.env.example:L98-100` | S | REMEDIATED |
| **CI-001** | CI/CD | Duplicación de Quality Gates y Checkov entre `ci.yml`, `api.yml` e `infra.yml` | `api.yml:L32-60`, `infra.yml:L80-88`, `ci.yml:L26-88` | S | CONFIRMED |
| **ARCH-002** | Arquitectura | Monolito de rutas concentrado en `apps/backend/server.ts` (1,201 líneas) | `apps/backend/server.ts:L35-1201` | M | REMEDIATED |
| **TST-001** | Testing | Cobertura E2E ausente para flujos administrativos del panel `/backoffice` | `tests/e2e/pokedex.spec.ts:L1-90` | M | CONFIRMED |

### P3 — Bajo

Ordenados por impacto, evidencia, riesgo y esfuerzo:

| ID | Área | Hallazgo | Evidencia | Esfuerzo | Estado |
| --- | --- | --- | --- | --- | --- |
| **DEP-001** | Dependencias | Dependencias de runtime backend duplicadas en `package.json` raíz | `package.json` vs `apps/backend/package.json:L17-27` | XS | REMEDIATED |
| **CI-002** | CI/CD | Filtro de rama inexistente `master` en 6 workflows | `.github/workflows/*.yml` | XS | REMEDIATED |
| **CLN-001** | Limpieza | 17 alias deprecados en `Taskfile.yml` para v2.0 | `Taskfile.yml:L176-564` | XS | CONFIRMED |
| **CLN-002** | Limpieza | Script legacy `scripts/seal-secret.ts` retenido tras adopción de ESO | `scripts/seal-secret.ts`, `Taskfile.yml` | XS | REMEDIATED |
| **SEC-001** | Seguridad | Excepciones históricas en allowlist de `.gitleaks.toml` | `.gitleaks.toml:L28-51` | XS | CONFIRMED |
| **CI-003** | CI/CD | MegaLinter en modo no bloqueante (`continue-on-error`) | `.github/workflows/mega-linter.yml:L27`, `.mega-linter.yml:L34` | S | CONFIRMED |
| **MOD-001** | Modernización | Oportunidad de emitir ESM nativo en backend en lugar de CommonJS | `apps/backend/package.json:L5,8` | S | RECOMMENDATION |

---

## 4. Quick Wins

Cambios de bajo riesgo y mínimo esfuerzo (XS/S) recomendados para posterior ejecución incremental (sin aplicar en esta fase de auditoría):

1. **Limpieza de dependencias en `package.json` raíz (`DEP-001`):** Remover la sección `dependencies` de aplicación del archivo raíz de forma segura; ya están presentes en `apps/backend/package.json`.
2. **Estandarización de triggers de rama en workflows (`CI-002`):** Remover la referencia a `master` en los 6 workflows afectados, unificando en `branches: [ main ]`.
3. **Alineación documental del stack frontend (`ARCH-001`):** Actualizar `README.md` y `docs/architecture/MONOREPO_STRUCTURE.md` para reemplazar menciones de React por Vanilla TypeScript + Vite.
4. **Retiro de `scripts/seal-secret.ts` (`CLN-002`):** Eliminar el script de Sealed Secrets y la tarea `secrets:seal` deprecada en Taskfile.

---

## 5. Deuda Técnica Clasificada

- **Deuda Técnica Confirmada:**
  - 17 alias de comandos deprecados en `Taskfile.yml` (`CLN-001` - retiro programado v2.0).
- **Deuda Técnica Remediada (2026-09-23):**
  - Desconexión y falta de puente PVC K8s vs GDrive (`OPS-001` - CronJob K8s nativo implementado).
  - Exposición de endpoint `/download` y botón UI (`SEC-002` - rutas y botón eliminados).
  - Duplicación de dependencias de runtime en raíz (`DEP-001` - consolidado en workspace backend).
  - Triggers residuales a rama `master` en workflows de CI (`CI-002` - unificado en main).
  - Script legacy `scripts/seal-secret.ts` y tarea `secrets:seal` (`CLN-002` - eliminados).
  - Controlador monolítico de rutas en `apps/backend/server.ts` (`ARCH-002` - modularizado en src/routes/).
- **Deuda Técnica Potencial:**
  - MegaLinter ejecutando sin bloquear PRs (`CI-003`).
- **Deuda Técnica Documental:**
  - Documentación y ADRs históricos que referencian React en lugar de Vanilla TypeScript (`ARCH-001`).
- **Deuda Técnica de Seguridad:**
  - Excepciones y hashes históricos allowlisteados en `.gitleaks.toml` (`SEC-001`).
- **Deuda Técnica de Testing:**
  - Falta de suite E2E de Playwright para `/backoffice.html` (`TST-001`).
- **Deuda Técnica de CI/CD:**
  - Solapamiento y doble ejecución de gates de test y Checkov entre `ci.yml`, `api.yml` e `infra.yml` (`CI-001`).

---

## 6. Métricas Objetivas del Repositorio

| Métrica | Valor Observado | Nota / Fuente |
| --- | --- | --- |
| **Cantidad total de aplicaciones** | 2 | `apps/backend`, `apps/frontend` |
| **Cantidad de workflows en CI/CD** | 16 | `.github/workflows/` |
| **Cantidad de dependencias directas únicas** | 24 | Consolidadas entre raíz y workspaces |
| **Cantidad de suites/archivos de test** | 20 | `tests/**/*.test.ts`, `spec.ts`, `js` |
| **Cantidad de scripts de soporte y automatización** | 11 | `scripts/` (1 shell, 9 TS, 1 d.ts) |
| **Cantidad de tareas formales en Taskfile** | 45+ | `Taskfile.yml` (651 líneas) |
| **Cantidad de plantillas en Helm Chart** | 26 | `infra/helm/pokedex/templates/` |
| **Cantidad de entornos IaC OpenTofu** | 4 | `aws`, `proxmox`, `lab`, `cloud-template` |
| **Cantidad de módulos IaC OpenTofu** | 4 | `compute`, `naming`, `security_baseline`, `tagging` |
| **Cantidad de playbooks Ansible** | 9 | `infra/ansible/playbooks/` |
| **Cantidad de roles Ansible** | 5 | `infra/ansible/roles/` |
| **Cantidad de aplicaciones declarativas ArgoCD** | 3 | `root-application`, `app-proxmox`, `app-cloud` |
| **Cantidad de Dockerfiles multi-stage** | 2 | Backend y Frontend (con espejo en raíz) |
| **Total de Hallazgos Diagnosticados** | 13 | 0 P0, 1 P1 (remediado), 5 P2, 7 P3 |

---

## 7. Baseline para Futuras Comparaciones

- **Commit SHA:** `2df20b3117ed9ba54946c8f460b7b05bafc1b973`
- **Branch:** `main`
- **Fecha:** 2026-09-23
- **Estado del working tree:** Limpio (archivos de auditoría no rastreados)
- **Findings Totales:** 13 (6 remediados, 7 pendientes)
  - **P0 (Crítico):** 0
  - **P1 (Alto):** 1 (`OPS-001` — REMEDIATED)
  - **P2 (Medio):** 5 (2 remediados: `SEC-002`, `ARCH-002`; 3 pendientes: `ARCH-001`, `CI-001`, `TST-001`)
  - **P3 (Bajo):** 7 (3 remediados: `DEP-001`, `CI-002`, `CLN-002`; 4 pendientes: `CI-003`, `CLN-001`, `SEC-001`, `MOD-001`)
- **Distribución de Findings por Dominio Técnico:**
  - **Operaciones / Disaster Recovery:** 1 (`OPS-001` - Remediado)
  - **Seguridad:** 2 (`SEC-001`, `SEC-002` - Remediado)
  - **Dependencias:** 1 (`DEP-001` - Remediado)
  - **Arquitectura:** 2 (`ARCH-001`, `ARCH-002` - Remediado)
  - **Calidad:** 0 independientes (consolidados en `ARCH-002` y `CI-003`)
  - **Testing:** 1 (`TST-001`)
  - **CI/CD:** 3 (`CI-001`, `CI-002` - Remediado, `CI-003`)
  - **Candidatos de Cleanup:** 2 (`CLN-001`, `CLN-002` - Remediado)
  - **Oportunidades de Modernización:** 1 (`MOD-001`)
- **Deuda Técnica Total:** 6 hallazgos confirmados activos + 6 remediados (`OPS-001`, `SEC-002`, `DEP-001`, `CI-002`, `CLN-002`, `ARCH-002`) + 1 recomendación de modernización
- **Limitaciones del Análisis:**
  1. No se realizaron conexiones en vivo a clústeres remotos de Kubernetes, hosts Proxmox ni cuentas de AWS; el análisis de IaC, Helm y GitOps se basó en el código, perfiles renderizados (`helm template`) y aserciones de policy-as-code.
  2. Las capacidades generativas de IA de Google Gemini no se ejecutaron dinámicamente de punta a punta ante la falta de `GEMINI_API_KEY` en el entorno local offline; se analizó su contrato, circuit breaker y sanitización anti-XSS (`sanitizeAIHtml`).
