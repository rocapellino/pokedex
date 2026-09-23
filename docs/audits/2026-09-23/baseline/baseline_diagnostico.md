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
- **Estado:** CONFIRMED
- **Skills Detectoras:** `repo-architecture`, `repo-quality`
- **Descripción:** El archivo `apps/backend/server.ts` posee 1,201 líneas de código. Aunque delega parte de la lógica en submódulos de `apps/backend/src/` (`services/`, `middleware/`, `validation/`, `db/`), todas las rutas y controladores (CRUD de Pokémon, emisión y verificación de sesiones administrativas, endpoints de IA de Gemini, health checks `/healthz` y `/readyz`, endpoint de descarga y recolector interno de métricas Prometheus) están declarados inline sobre la instancia raíz de `app` de Express.
- **Evidencia:**
  - `apps/backend/server.ts:L35-1201`.
- **Archivos Afectados:**
  - `apps/backend/server.ts`
- **Impacto:** Alta concentración de responsabilidades en un solo archivo, aumento de la complejidad ciclomática global, mayor propensión a conflictos de merge en flujos concurrentes y dificultad para testear controladores de forma aislada.
- **Recomendación:** Desacoplar `server.ts` extrayendo las rutas en routers modulares de Express (`src/routes/pokemons.ts`, `src/routes/auth.ts`, `src/routes/ai.ts`, `src/routes/health.ts`).
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
- **Estado:** CONFIRMED
- **Skills Detectoras:** `repo-security`, `repo-quality`
- **Descripción:** El backend incluye un endpoint `GET /download` que empaqueta dinámicamente un archivo `.tar.gz` con el código del repositorio y lo entrega como stream HTTP. Aunque el endpoint está protegido por defecto en producción mediante la variable `ENABLE_REPO_DOWNLOAD` (retornando HTTP 403) y filtra archivos `.env`, la existencia de lógica de empaquetado de código local dentro de la imagen de producción representa un riesgo residual si la variable es habilitada por error.
- **Evidencia:**
  - `apps/backend/server.ts:L1000-1120`.
  - `.env.example:L98-100`.
- **Archivos Afectados:**
  - `apps/backend/server.ts`
- **Impacto:** Riesgo potencial de exfiltración de código fuente o archivos del contenedor si se activa indebidamente en producción.
- **Recomendación:** Eliminar el endpoint en imágenes de producción o restringirlo exclusivamente a entornos locales de desarrollo con verificación explícita de red loopback.
- **Esfuerzo:** S

---

### 2.3 Dependencias

---

#### [DEP-001] Duplicación de dependencias de runtime entre la raíz del monorepo y el workspace `apps/backend`

- **Categoría:** Dependencias / Arquitectura
- **Severidad:** P3 (Bajo)
- **Confianza:** HIGH
- **Estado:** CONFIRMED
- **Skills Detectoras:** `repo-dependencies`, `repo-architecture`
- **Descripción:** Todas las dependencias de runtime del backend (`@google/genai`, `cors`, `express`, `ioredis`, `pg`, `pino`, `zod`) están declaradas simultáneamente en el `package.json` raíz (L48-56) y en `apps/backend/package.json` (L17-27). En un monorepo con npm workspaces, la raíz debe albergar exclusivamente herramientas de desarrollo globales (`turbo`, `commitlint`, `@types/*`, compiladores), mientras que las librerías de aplicación deben residir en su workspace correspondiente.
- **Evidencia:**
  - `package.json:L48-56`.
  - `apps/backend/package.json:L17-27`.
- **Archivos Afectados:**
  - `package.json`
- **Impacto:** Ambigüedad en el hoisting de módulos, posibilidad de que otros paquetes consuman dependencias no declaradas explícitamente (phantom dependencies) y riesgo de divergencia de versiones.
- **Recomendación:** Remover las `dependencies` de aplicación del `package.json` raíz, consolidándolas en `apps/backend/package.json`.
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
- **Estado:** CONFIRMED
- **Skills Detectoras:** `repo-ci`, `repo-cleanup`
- **Descripción:** Seis workflows (`api.yml`, `web.yml`, `infra.yml`, `security-code-scanning.yml`, `security-gitleaks.yml`, `security-trivy.yml`) escuchan eventos en `branches: [ main, master ]`, mientras que el pipeline principal `ci.yml` y el workflow de release `release-tag.yml` operan estrictamente sobre `main`. La rama `master` no existe en el repositorio.
- **Evidencia:**
  - `.github/workflows/api.yml:L8,16`.
  - `.github/workflows/web.yml:L8,14`.
  - `.github/workflows/infra.yml:L8,13`.
  - `.github/workflows/security-code-scanning.yml:L9,16`.
  - `.github/workflows/security-gitleaks.yml:L8,10`.
  - `.github/workflows/security-trivy.yml:L9,10,19,20`.
- **Archivos Afectados:**
  - Los 6 workflows mencionados en `.github/workflows/`.
- **Impacto:** Deuda técnica de configuración residual sin utilidad operativa.
- **Recomendación:** Remover la referencia a `master`, dejando únicamente `main` en todos los workflows.
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
- **Estado:** CONFIRMED
- **Skills Detectoras:** `repo-cleanup`, `repo-security`
- **Descripción:** El script `scripts/seal-secret.ts` utilizaba Bitnami Sealed Secrets (`kubeseal`). Tras adoptarse External Secrets Operator (ESO) con HashiCorp Vault y AWS Secrets Manager (ADR-005), la tarea `secrets:seal` fue marcada como legacy en Taskfile, pero el archivo TypeScript aún permanece en el árbol de código.
- **Evidencia:**
  - `scripts/seal-secret.ts:L1-170`.
  - `Taskfile.yml:L347-351`.
- **Archivos Afectados:**
  - `scripts/seal-secret.ts`
  - `Taskfile.yml`
- **Impacto:** Mantenimiento de código que ya no forma parte del flujo de aprovisionamiento recomendado.
- **Recomendación:** Retirar el script `scripts/seal-secret.ts` y eliminar la tarea `secrets:seal`.
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

## 3. Matriz de Priorización de Hallazgos

### P0 — Crítico (Bloqueante)

- *No se identificaron hallazgos P0.*

### P1 — Alto

- *No se identificaron hallazgos P1.*

### P2 — Medio

Ordenados por impacto, evidencia, riesgo y esfuerzo:

| ID | Área | Hallazgo | Evidencia | Esfuerzo | Estado |
| --- | --- | --- | --- | --- | --- |
| **ARCH-001** | Arquitectura / Docs | Discrepancia: documentación histórica cita React pero código real es Vanilla TypeScript | `apps/frontend/package.json:L13-20`, `.github/workflows/web.yml:L2` | S | CONFIRMED |
| **SEC-002** | Seguridad | Exposición condicional del endpoint `GET /download` | `apps/backend/server.ts:L1000-1120`, `.env.example:L98-100` | S | CONFIRMED |
| **CI-001** | CI/CD | Duplicación de Quality Gates y Checkov entre `ci.yml`, `api.yml` e `infra.yml` | `api.yml:L32-60`, `infra.yml:L80-88`, `ci.yml:L26-88` | S | CONFIRMED |
| **ARCH-002** | Arquitectura | Monolito de rutas concentrado en `apps/backend/server.ts` (1,201 líneas) | `apps/backend/server.ts:L35-1201` | M | CONFIRMED |
| **TST-001** | Testing | Cobertura E2E ausente para flujos administrativos del panel `/backoffice` | `tests/e2e/pokedex.spec.ts:L1-90` | M | CONFIRMED |

### P3 — Bajo

Ordenados por impacto, evidencia, riesgo y esfuerzo:

| ID | Área | Hallazgo | Evidencia | Esfuerzo | Estado |
| --- | --- | --- | --- | --- | --- |
| **DEP-001** | Dependencias | Dependencias de runtime backend duplicadas en `package.json` raíz | `package.json:L48-56` vs `apps/backend/package.json:L17-27` | XS | CONFIRMED |
| **CI-002** | CI/CD | Filtro de rama inexistente `master` en 6 workflows | `api.yml`, `web.yml`, `infra.yml`, `security-*.yml` | XS | CONFIRMED |
| **CLN-001** | Limpieza | 17 alias deprecados en `Taskfile.yml` para v2.0 | `Taskfile.yml:L176-564` | XS | CONFIRMED |
| **CLN-002** | Limpieza | Script legacy `scripts/seal-secret.ts` retenido tras adopción de ESO | `scripts/seal-secret.ts:L1-170`, `Taskfile.yml:L347` | XS | CONFIRMED |
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
  - Duplicación de dependencias de runtime en raíz (`DEP-001`).
  - 17 alias de comandos deprecados en `Taskfile.yml` (`CLN-001`).
  - Triggers residuales a rama `master` en workflows de GitHub Actions (`CI-002`).
  - Script legacy `scripts/seal-secret.ts` (`CLN-002`).
- **Deuda Técnica Potencial:**
  - Riesgo residual en caso de habilitación indebida de `ENABLE_REPO_DOWNLOAD` (`SEC-002`).
  - MegaLinter ejecutando sin bloquear PRs (`CI-003`).
- **Deuda Técnica Documental:**
  - Documentación y ADRs históricos que referencian React en lugar de Vanilla TypeScript (`ARCH-001`).
- **Deuda Técnica de Seguridad:**
  - Excepciones y hashes históricos allowlisteados en `.gitleaks.toml` (`SEC-001`).
- **Deuda Técnica de Testing:**
  - Falta de suite E2E de Playwright para `/backoffice.html` (`TST-001`).
- **Deuda Técnica de Arquitectura:**
  - Controlador monolítico de 1,201 líneas en `apps/backend/server.ts` (`ARCH-002`).
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
| **Total de Hallazgos Diagnosticados** | 12 | 0 P0, 0 P1, 5 P2, 7 P3 |

---

## 7. Baseline para Futuras Comparaciones

- **Commit SHA:** `2df20b3117ed9ba54946c8f460b7b05bafc1b973`
- **Branch:** `main`
- **Fecha:** 2026-09-23
- **Estado del working tree:** Limpio (archivos de auditoría no rastreados)
- **Findings Totales:** 12
  - **P0 (Crítico):** 0
  - **P1 (Alto):** 0
  - **P2 (Medio):** 5 (`ARCH-001`, `ARCH-002`, `SEC-002`, `CI-001`, `TST-001`)
  - **P3 (Bajo):** 7 (`DEP-001`, `CI-002`, `CI-003`, `CLN-001`, `CLN-002`, `SEC-001`, `MOD-001`)
- **Distribución de Findings por Dominio Técnico:**
  - **Seguridad:** 2 (`SEC-001`, `SEC-002`)
  - **Dependencias:** 1 (`DEP-001`)
  - **Arquitectura:** 2 (`ARCH-001`, `ARCH-002`)
  - **Calidad:** 0 independientes (consolidados en `ARCH-002` y `CI-003`)
  - **Testing:** 1 (`TST-001`)
  - **CI/CD:** 3 (`CI-001`, `CI-002`, `CI-003`)
  - **Candidatos de Cleanup:** 2 (`CLN-001`, `CLN-002`)
  - **Oportunidades de Modernización:** 1 (`MOD-001`)
- **Deuda Técnica Total:** 11 hallazgos confirmados + 1 recomendación de modernización
- **Limitaciones del Análisis:**
  1. No se realizaron conexiones en vivo a clústeres remotos de Kubernetes, hosts Proxmox ni cuentas de AWS; el análisis de IaC, Helm y GitOps se basó en el código, perfiles renderizados (`helm template`) y aserciones de policy-as-code.
  2. Las capacidades generativas de IA de Google Gemini no se ejecutaron dinámicamente de punta a punta ante la falta de `GEMINI_API_KEY` en el entorno local offline; se analizó su contrato, circuit breaker y sanitización anti-XSS (`sanitizeAIHtml`).
