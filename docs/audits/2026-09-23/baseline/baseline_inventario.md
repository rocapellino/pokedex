# Baseline Inventario

- **Fecha:** 2026-09-23
- **Commit SHA:** `2df20b3117ed9ba54946c8f460b7b05bafc1b973`
- **Branch:** `main`
- **Estado del Working Tree:** Limpio respecto a git tracking; directorios locales no rastreados: `.agents/` y `docs/audit/`
- **Metodología:** Inspección estricta en modo solo lectura de código fuente, archivos de configuración, manifiestos IaC/K8s/GitOps, scripts y workflows de CI/CD según directivas de `repo-context` y `repo-audit`. Principio *evidence-first*: ninguna afirmación sin respaldo factual directo.

---

## 1. Identidad del Repositorio

- **Nombre:** `pokedex`
- **Versión:** `1.0.0` (declarada en raíz y workspaces; versionado OCI/Release gestionado automáticamente vía etiquetas semánticas `v*`)
- **Package Manager:** `npm@11.17.0`
- **Versión declarada de Node.js:** `nodejs 22.13.0` (LTS)
- **Versión declarada de npm:** `11.17.0`
- **Lenguaje principal:** TypeScript (configurado con target `ES2022`, module `NodeNext`, modo estricto)
- **Framework principal:**
  - **Backend:** Express `^4.22.2` sobre Node.js 22 LTS
  - **Frontend:** Vanilla TypeScript (`src/pokedex.ts`, `src/backoffice.ts`) con Vite `^8.2.2` como bundler y Nginx `1.31-alpine` como servidor web / proxy inverso. *(Nota factual: La documentación histórica menciona React, pero el código fuente real implementa TypeScript vanilla con manipulación DOM nativa y DOMPurify).*
- **Tipo de repositorio:** Monorepo con npm workspaces (`apps/backend`, `apps/frontend`) y aceleración opcional mediante Turborepo (`turbo.json`).
- **Branch actual:** `main`
- **Commit actual:** `2df20b3117ed9ba54946c8f460b7b05bafc1b973`
- **Estado del working tree:** Sin modificaciones sobre archivos rastreados (`git status -s`: `?? .agents/`, `?? docs/audit/`).

---

## 2. Estructura del Repositorio

### Directorios Principales

- `apps/`
  - `apps/backend/`: Servicio de API REST, lógica de persistencia, integración con Google Gemini AI, autenticación y telemetría.
  - `apps/frontend/`: Aplicación cliente (catálogo público Pokédex y panel `/backoffice`), plantillas de Nginx y assets estáticos.
- `infra/`
  - `infra/ansible/`: Automatización y hardening de configuración de hosts en Capa 2 (playbooks, roles, inventarios).
  - `infra/docker/`: Recursos Docker auxiliares (`postgres/init.sql`).
  - `infra/helm/`: Helm chart unificado `pokedex` con 26 templates y perfiles de valores.
  - `infra/k8s/`: Manifiestos de Kubernetes complementarios (Kind local, políticas Kyverno, integración ESO, pod security standards).
  - `infra/monitoring/`: Configuración de Grafana Alloy, dashboards JSON, alertas Prometheus y scripts de despliegue a Grafana Cloud.
  - `infra/opentofu/`: Infraestructura como Código en Capa 1 (entornos `aws`, `proxmox`, `lab`, `cloud-template` y 4 módulos reutilizables).
- `gitops/`
  - `gitops/apps/`: Manifiestos declarativos de aplicaciones ArgoCD (`root-application.yaml`, `app-proxmox.yaml`, `app-cloud.yaml`).
  - `gitops/environments/`: Archivos de valores GitOps específicos por entorno (`aws/values.yaml`, `proxmox/values.yaml`).
  - `gitops/health-checks/`: Custom Resource Health Checks para ArgoCD (`argocd-cm-healthchecks.yaml`).
- `scripts/`: Scripts operativos de mantenimiento, gobernanza, seguridad, retención de GHCR, Disaster Recovery y sincronización con Linear.
- `tests/`: Batería integral de pruebas automatizadas (unitarias, integración, concurrencia, fuzzing, pentest, E2E, accesibilidad WCAG, GitOps, seguridad y rendimiento).
- `docs/`: Acervo documental exhaustivo (especificaciones API, 15 documentos de arquitectura, 27 ADRs, guías DevOps, operaciones, runbooks y seguridad).
- `.github/`: 16 workflows de GitHub Actions para CI/CD, Quality Gates, seguridad, escaneos dinámicos, retención y sincronización.

### Archivos de Configuración y Tooling Raíz

- `.checkov.yaml`: Configuración centralizada de exclusiones para análisis estático de IaC.
- `.dockerignore`: Reglas de exclusión para compilación de imágenes Docker en raíz.
- `.env.example`: Plantilla canónica de variables de entorno y configuración sensible.
- `.gitignore`: Exclusiones para control de versiones git.
- `.gitleaks.toml` / `.gitleaksignore`: Reglas, allowlists y exclusiones para detección de secretos expuestos.
- `.kube-linter.yaml`: Reglas de auditoría estática de manifiestos y charts Kubernetes.
- `.mega-linter.yml`: Configuración de linters de sintaxis (Hadolint, Shellcheck, Actionlint, Yamllint, Jsonlint).
- `.pre-commit-config.yaml`: Hooks de pre-commit para formato, validación de schemas y detección de secretos.
- `.semgrepignore`: Exclusiones de directorios compilados y librerías para Semgrep SAST.
- `.tool-versions`: Definición de versiones declaradas de herramientas CLI (`nodejs`, `opentofu`, `helm`, `kubectl`, `ansible-core`).
- `commitlint.config.js`: Reglas de Conventional Commits para mensajes de commit.
- `docker-compose.yml` / `docker-compose.dev.yml`: Definición de contenedores locales (dual-profile DX).
- `Dockerfile`: Definición de contenedor multi-stage en raíz (espejo/enlace de `apps/backend/Dockerfile`).
- `lighthouserc.json`: Configuración de auditoría de rendimiento y Web Vitals con Lighthouse CI.
- `metadata.json`: Metadatos de la aplicación y declaración de capacidades del servidor.
- `package.json` / `package-lock.json`: Definición de dependencias raíz, workspaces, scripts y overrides de seguridad.
- `playwright.config.ts`: Configuración del framework Playwright para pruebas E2E y accesibilidad.
- `renovate.json`: Configuración de Renovate Bot para actualización automática y controlada de dependencias.
- `sonar-project.properties`: Configuración de análisis de calidad, cobertura y exclusiones en SonarCloud.
- `Taskfile.yml`: Catálogo formal de tareas de automatización para desarrollo, testing e infraestructura.
- `tsconfig.json`: Configuración global de TypeScript para backend y scripts.
- `turbo.json`: Declaración de pipelines y dependencias de tareas para Turborepo.

---

## 3. Aplicaciones y Componentes

### 3.1 `apps/backend` (Pokédex Backend API)

- **Ubicación:** `apps/backend/`
- **Propósito:** API RESTful que gestiona el catálogo de Pokémon, persistencia en base de datos, caché en memoria, rate limiting distribuido, sesiones administrativas y generación de contenido asistida por IA.
- **Tecnología:** Node.js 22 LTS, TypeScript (`~7.0.2`), Express (`^4.22.2`), Drizzle ORM (`^0.45.2`), pg (`^8.23.0`), ioredis (`^6.0.0`), Pino (`^10.3.1`), Zod (`^4.6.2`), Google GenAI SDK (`@google/genai@2.21.0`), express-rate-limit (`^8.7.0`).
- **Entrypoints:**
  - Desarrollo: `apps/backend/server.ts` (vía `tsx server.ts`).
  - Producción: `apps/backend/dist/server.cjs` (compilado como CommonJS empaquetado mediante `esbuild`).
- **Scripts asociados (`apps/backend/package.json`):** `dev`, `build`, `seed`, `start`, `lint`, `typecheck`, `db:generate`, `db:migrate`, `db:studio`.
- **Endpoints principales:**
  - `GET /healthz`: Sonda de liveness rápida.
  - `GET /readyz`: Sonda de readiness que valida estado del ciclo de vida (`isShuttingDown`), conectividad a PostgreSQL y Redis.
  - `GET /metrics`: Exposición de métricas en formato Prometheus.
  - `GET /version`: Metadatos de versión (`APP_VERSION`, `GIT_SHA`, uptime, Node.js).
  - `GET /pokemons`, `GET /pokemons/:id`: Consulta de catálogo con paginación (`limit`, `offset`) y filtros.
  - `POST /pokemons`, `PUT /pokemons/:id`, `DELETE /pokemons/:id`: Mutaciones del catálogo protegidas por autenticación administrativa.
  - `POST /api/v1/auth/session`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/verify`: Gestión de sesiones de administración con tokens HMAC y revocación en Redis.
  - `POST /api/v1/ai/diagram`, `POST /api/v1/ai/mockup`, `POST /api/v1/ai/image`: Servicios de IA mediante Gemini API con circuit breaker y sanitización anti-XSS (`sanitizeAIHtml`).
  - `GET /download`: Descarga empaquetada del repositorio (bloqueada por defecto en producción salvo `ENABLE_REPO_DOWNLOAD=true`).

### 3.2 `apps/frontend` (Pokédex Web Client)

- **Ubicación:** `apps/frontend/`
- **Propósito:** Interfaz de usuario web para visualización del catálogo Pokédex, filtrado reactivo en tiempo real, cambio de tema (light/dark) y consola administrativa (`backoffice.html`).
- **Tecnología:** TypeScript vanilla (`src/pokedex.ts`, `src/backoffice.ts`, `src/sanitizer.ts`, `src/theme.ts`), DOMPurify (`^3.4.15`), Vite (`^8.2.2`), Nginx `1.31-alpine`.
- **Entrypoints:**
  - Desarrollo: Servidor de desarrollo Vite en puerto `5173` con proxy hacia backend.
  - Producción: Nginx sirviendo artefactos estáticos de `apps/frontend/dist/` en puerto `8080` con plantilla `nginx.conf.template` y proxy reverso hacia API.
- **Scripts asociados (`apps/frontend/package.json`):** `dev`, `build`, `preview`, `lint`, `typecheck`.

### 3.3 Componentes de Persistencia e Infraestructura

- **PostgreSQL 16:** Base de datos relacional principal. Esquema gestionado por Drizzle ORM (`pokedex_entries`, `pokedex_id_seq`).
- **PgBouncer 1.22.0:** Connection pooler intermedio desplegable en Kubernetes (`infra/helm/pokedex/templates/pgbouncer-deployment.yaml`).
- **Redis 7:** Almacén en memoria utilizado para rate limiting distribuido, lista de revocación de sesiones administrativas y caché volátil.
- **Google Gemini AI:** Servicio externo de inteligencia artificial consumido mediante `@google/genai` (modelo por defecto `gemini-2.5-flash`), con fallback automático y circuit breaker en caso de indisponibilidad.
- **Docker / Docker Compose:**
  - `docker-compose.yml`: Perfil de producción local con segmentación DMZ (`frontend-net` pública, `backend-net` interna aislada).
  - `docker-compose.dev.yml`: Perfil de desarrollo con hot-reload, puertos expuestos y recolector de métricas Grafana Alloy + cAdvisor.
- **Kubernetes (Helm Chart `pokedex`):**
  - Despliegue de API (`api-deployment.yaml`), Frontend Web (`web-deployment.yaml`), PostgreSQL StatefulSet (`postgres-statefulset.yaml`), PgBouncer (`pgbouncer-deployment.yaml`) y Redis (`redis-deployment.yaml`).
  - Autoscaling y resiliencia: HPA para API y Web, PDB (`pdb.yaml`), ResourceQuotas y LimitRanges.
  - Políticas de red: NetworkPolicies nativas (`network-policies.yaml`) y CiliumNetworkPolicy L7 (`cilium-network-policies.yaml`) con filtrado estricto FQDN hacia `generativelanguage.googleapis.com` y bloqueo de Cloud IMDS (`169.254.169.254/32`).
  - Tareas programadas: Job de siembra inicial (`seed-job.yaml`), CronJob de backups (`backup-cronjob.yaml`) y CronJob de verificación/restauración de DR (`backup-restore-verify-cronjob.yaml`).
- **GitOps (ArgoCD):**
  - Patrón App-of-Apps: `gitops/apps/root-application.yaml`.
  - Aplicaciones hijas: `gitops/apps/app-proxmox.yaml` (on-premise) y `gitops/apps/app-cloud.yaml` (AWS EKS).
  - Parámetros por entorno: `gitops/environments/aws/values.yaml` y `gitops/environments/proxmox/values.yaml`.
  - Evaluadores de salud: `gitops/health-checks/argocd-cm-healthchecks.yaml`.
- **OpenTofu (IaC):**
  - Entornos: `infra/opentofu/environments/` (`aws`, `proxmox`, `lab`, `cloud-template`).
  - Módulos: `infra/opentofu/modules/` (`compute`, `naming`, `security_baseline`, `tagging`).
- **Ansible:**
  - Playbooks: `infra/ansible/playbooks/` (`host_baseline.yml`, `prepare_hosts.yml`, `security_hardening.yml`, `setup_bastion.yml`, `setup_k3s.yml`, `setup_nodes.yml`, `setup_pbs_backup_blueprint.yml`, `setup_vault.yml`, `validate_hosts.yml`).
  - Roles: `base_os`, `container_runtime`, `firewall`, `hardening`, `kubernetes_prerequisites`.
  - Inventario: `infra/ansible/inventory/hosts.ini`.

---

## 4. Dependencias

### 4.1 Raíz (`package.json`)

- **`dependencies`:**
  - `@google/genai`: `2.21.0`
  - `cors`: `^2.8.5`
  - `express`: `^4.22.2`
  - `ioredis`: `^6.0.0`
  - `pg`: `^8.23.0`
  - `pino`: `^10.3.1`
  - `zod`: `^4.6.2`
- **`devDependencies`:**
  - `@axe-core/playwright`: `^4.13.0`
  - `@commitlint/cli`: `^21.2.2`
  - `@commitlint/config-conventional`: `^21.2.2`
  - `@lhci/cli`: `^0.15.1`
  - `@playwright/test`: `^1.63.0`
  - `@types/cors`: `^2.8.17`
  - `@types/express`: `^4.17.21`
  - `@types/node`: `^22.13.0`
  - `@types/pg`: `^8.23.1`
  - `esbuild`: `^0.28.2`
  - `tsx`: `^4.19.3`
  - `turbo`: `^2.10.12`
  - `typescript`: `~7.0.2`
- **`overrides` (Parches explícitos de seguridad en árbol de dependencias):**
  - `qs`: `^6.16.0`
  - `uuid`: `^11.1.1`
  - `tmp`: `^0.2.6`
  - `cookie`: `^2.0.1`
  - `esbuild`: `^0.28.2`
  - `@puppeteer/browsers`: `^3.0.0`
  - `proxy-agent`: `^8.0.2`

### 4.2 Backend (`apps/backend/package.json`)

- **`dependencies`:**
  - `@google/genai`: `2.21.0`
  - `cors`: `^2.8.5`
  - `drizzle-orm`: `^0.45.2`
  - `express`: `^4.22.2`
  - `express-rate-limit`: `^8.7.0`
  - `ioredis`: `^6.0.0`
  - `pg`: `^8.23.0`
  - `pino`: `^10.3.1`
  - `zod`: `^4.6.2`
- **`devDependencies`:**
  - `@types/cors`: `^2.8.17`
  - `@types/express`: `^4.17.21`
  - `@types/node`: `^22.13.0`
  - `@types/pg`: `^8.23.1`
  - `drizzle-kit`: `^0.31.10`
  - `esbuild`: `^0.28.2`
  - `tsx`: `^4.19.3`
  - `typescript`: `~7.0.2`
- **`overrides`:**
  - `qs`: `^6.16.0`
  - `esbuild`: `^0.28.2`

### 4.3 Frontend (`apps/frontend/package.json`)

- **`dependencies`:**
  - `dompurify`: `^3.4.15`
- **`devDependencies`:**
  - `@types/node`: `^22.13.0`
  - `typescript`: `~7.0.2`
  - `vite`: `^8.2.2`

---

## 5. Scripts

### 5.1 Scripts en `package.json` (Raíz)

- **Desarrollo y Ejecución:**
  - `dev`: Inicia el servidor backend en desarrollo (`npm run dev --workspace=@pokedex/backend`).
  - `start`: Ejecuta el artefacto compilado del backend (`npm run start --workspace=@pokedex/backend`).
  - `seed`: Ejecuta la siembra de base de datos (`npm run seed --workspace=@pokedex/backend`).
- **Compilación y Build:**
  - `build`: Compila backend y frontend (`npm run build:backend && npm run build:frontend`).
  - `build:backend`: Compila backend a `dist/server.cjs`, `dist/seed.cjs`, `dist/migrate.cjs` con `esbuild`.
  - `build:frontend`: Compila frontend (`tsc && vite build`).
  - `build:turbo`: Compila con caché de Turborepo (`turbo run build`).
- **Calidad y Verificación de Tipos:**
  - `typecheck`: Verificación de tipos TypeScript estricta sin emitir JS (`tsc --noEmit`).
  - `typecheck:turbo`: Verificación de tipos mediante Turborepo (`turbo run typecheck`).
  - `lint`: Ejecuta comprobaciones de tipos en backend, frontend y raíz.
  - `lint:turbo`: Ejecuta linting coordinado por Turborepo.
  - `validate`: Pipeline local integral (`npm run lint && npm run build && npm test && npm run test:fuzz`).
  - `commitlint`: Valida mensajes de commit con `@commitlint/cli`.
- **Testing:**
  - `test`: Ejecuta pruebas unitarias y de integración con el test runner nativo de Node.js (`tsx --test tests/**/*.test.ts`).
  - `test:coverage`: Ejecuta la suite de pruebas generando reporte LCOV en `coverage/lcov.info`.
  - `test:fuzz`: Ejecuta suite de fuzzing dinámico (`tsx --test tests/fuzzing.test.ts`).
  - `test:e2e`: Pruebas de integración E2E con Playwright (`playwright test`).
  - `test:a11y`: Pruebas de accesibilidad WCAG filtrando tag `@a11y` (`playwright test -g @a11y`).
  - `playwright:install`: Instala navegadores headless de Playwright (Chromium).
  - `perf:lighthouse`: Auditoría de rendimiento con Lighthouse CI (`lhci autorun`).
- **Seguridad y Auditoría:**
  - `governance:audit-scripts`: Audita la lista blanca de scripts `.sh` autorizados en el monorepo (ADR-020).
  - `secrets:audit-rotation`: Audita configuración de rotación de secretos y Stakater Reloader.
  - `test:security:egress`: Ejecuta pruebas de filtrado de salida eBPF Anti-SSRF.
  - `probe:security:egress`: Ejecuta sonda de conectividad y bloqueo de egress L7.
- **GitOps y Control de Versiones:**
  - `gitops:verify-parity`: Valida paridad de digests criptográficos entre entornos GitOps.
  - `gitops:verify-parity:strict`: Validación estricta renderizando manifiestos con `helm template`.
  - `gitops:pin`: Actualiza el `targetRevision` en manifiestos de ArgoCD.
  - `gitops:pin:check`: Audita coherencia de pines en aplicaciones de ArgoCD.
- **Kubernetes y Operaciones:**
  - `k8s:rollout-restart`: Ejecuta reinicio controlado de pods en Kubernetes.
  - `k8s:verify-vault-architecture`: Simula y valida la integración de Vault con External Secrets Operator.
  - `ghcr:retention`: Aplica política de retención en GitHub Container Registry (últimas 3 versiones).
  - `ghcr:retention:dry-run`: Simulación sin mutación de retención en GHCR.
- **Base de Datos:**
  - `db:generate`: Genera migraciones Drizzle (`drizzle-kit generate`).
  - `db:migrate`: Ejecuta migraciones en la base de datos (`tsx src/db/migrate.ts`).
  - `db:studio`: Abre la interfaz interactiva Drizzle Studio (`drizzle-kit studio`).

### 5.2 Scripts Secundarios en `scripts/`

1. `scripts/declarations.d.ts`: Declaraciones de tipos para Node.js y utilidades.
2. `scripts/dr_verify_restore.sh`: Script ejecutable bash de validación de Disaster Recovery y restauración en base de datos efímera.
3. `scripts/ghcr-retention.ts`: Script TypeScript para purgar imágenes antiguas en GHCR.
4. `scripts/github-security-linear-sync.ts`: Sincronización de alertas de GitHub Security hacia Linear.
5. `scripts/k8s-rollout-restart.ts`: Script de gestión de reinicios controlados en clúster K8s.
6. `scripts/probe-egress-security.ts`: Sonda de verificación de políticas de egress L7.
7. `scripts/seal-secret.ts`: Utilidad legacy de sellado con Bitnami Sealed Secrets.
8. `scripts/sonar-linear-sync.ts`: Sincronización de métricas de calidad SonarQube hacia Linear.
9. `scripts/update-gitops-pin.ts`: Actualización automatizada de etiquetas de release en manifiestos de ArgoCD.
10. `scripts/verify-image-digest-parity.ts`: Verificador de consistencia de digest OCI en manifiestos Helm y GitOps.
11. `scripts/verify-secret-rotation.ts`: Verificación de anotaciones de rotación de credenciales y Reloader.

---

## 6. Testing

### Herramientas y Frameworks de Test

- **Test Runner:** Runner nativo de Node.js (`node:test`) ejecutado mediante `tsx --test`.
- **Assertion Library:** `node:assert/strict` nativo de Node.js.
- **E2E Testing:** Playwright (`@playwright/test@^1.63.0`).
- **Accesibilidad (a11y):** Axe-core para Playwright (`@axe-core/playwright@^4.13.0`) evaluando estándares WCAG 2.0 / 2.1 AA.
- **Auditoría Web Vitals:** Lighthouse CI (`@lhci/cli@^0.15.1`) con configuración `lighthouserc.json`.
- **Pruebas de Carga / Estrés:** Grafana k6 CLI (`tests/performance/k6_stress_test.js`).
- **Fuzzing Dinámico:** Generación pseudo-aleatoria de payloads en `tests/fuzzing.test.ts`.
- **Cobertura:** Instrumentación nativa de Node.js (`--experimental-test-coverage`) exportando en formato LCOV (`coverage/lcov.info`).

### Inventario de Archivos de Test (20 archivos)

- **Raíz (`tests/`):**
  1. `tests/api-limits.test.ts`: Pruebas de límites de payload HTTP, headers gigantes y protección DoS.
  2. `tests/concurrency.test.ts`: Pruebas de concurrencia y control de colisiones en operaciones de escritura.
  3. `tests/contracts.test.ts`: Validación de contratos de interfaz y esquemas de respuesta JSON.
  4. `tests/fuzzing.test.ts`: Fuzz testing sobre endpoints REST y parámetros de búsqueda.
  5. `tests/pentest.test.ts`: Suite de pruebas de penetración (inyecciones SQL, XSS, SSRF, path traversal, auth bypass).
  6. `tests/security.test.ts`: Verificación de cabeceras de seguridad, CORS, rate limiting y sesiones.
  7. `tests/storage.test.ts`: Pruebas unitarias de capa de almacenamiento y modo degradado.
  8. `tests/version.test.ts`: Verificación de endpoints de salud (`/healthz`, `/readyz`, `/version`).
- **E2E y UI (`tests/e2e/`):**
  9. `tests/e2e/pokedex.spec.ts`: Flujo E2E de catálogo, búsqueda reactiva, cambio de tema, auditoría Axe-core WCAG y prueba COEP.
- **GitOps (`tests/gitops/`):**
  10. `tests/gitops/argocd_pinning.test.ts`: Validación de referencias inmutables y pinning en manifiestos de ArgoCD.
- **Rendimiento (`tests/performance/`):**
  11. `tests/performance/k6_stress_test.js`: Escenarios de estrés y límites de concurrencia con k6.
- **Seguridad y Plataforma (`tests/security/`):**
  12. `tests/security/deploy_scripts_security.test.ts`: Análisis estático y dinámico de seguridad sobre scripts de automatización.
  13. `tests/security/dr_backup_security.test.ts`: Verificación de cifrado y firma criptográfica en snapshots de backup.
  14. `tests/security/egress_anti_ssrf.test.ts`: Validación de reglas de bloqueo de salida de red y anti-SSRF.
  15. `tests/security/ghcr_retention.test.ts`: Pruebas de la lógica de retención de paquetes en GHCR.
  16. `tests/security/github_security_linear_sync.test.ts`: Validación de sincronización entre GitHub Security y Linear.
  17. `tests/security/gitops_image_parity.test.ts`: Verificación de consistencia de digest OCI en GitOps.
  18. `tests/security/operation_dr_benchmarks.test.ts`: Benchmarks de tiempo de recuperación (RTO/RPO) en simulacros de DR.
  19. `tests/security/supply_chain_security.test.ts`: Validación de firmas Cosign, atestaciones de SBOM y procedencia SLSA.
  20. `tests/security/vault_redeploy_contract.test.ts`: Validación de contratos de inyección y rotación de secretos con Vault/ESO.

---

## 7. CI/CD (GitHub Actions)

El repositorio cuenta con 16 workflows configurados en `.github/workflows/`:

| Archivo | Nombre en Workflow | Triggers | Propósito Principal y Herramientas |
| --- | --- | --- | --- |
| `ci.yml` | 🚀 CI/CD Pipeline - Quality Gates & Release | push/PR a `main` | Pipeline central: Quality gates paralelos (`npm test`, `fuzzing`, Semgrep SAST, Checkov IaC, Dependency Review), build Docker multi-stage, escaneo Trivy, publicación en GHCR, empaquetado Helm OCI, firma criptográfica Cosign de imagen y chart (Keyless Sigstore OIDC), atestación de SBOM CycloneDX, procedencia SLSA Level 3 y retención en GHCR. |
| `api.yml` | ⚙️ Backend API CI | push/PR en rutas backend | Validación específica del servicio backend: lint, build con esbuild, pruebas unitarias y `npm audit` omitiendo devDependencies. |
| `web.yml` | 🌐 Frontend Web CI | push/PR en rutas frontend | Validación específica de interfaz: typecheck TypeScript, validación de sintaxis Nginx (`nginx -t`), pruebas E2E y accesibilidad Playwright + Axe-core, y auditoría Web Vitals con Lighthouse CI. |
| `infra.yml` | ⚙️ Infrastructure & IaC CI | push/PR en `infra/**` | Validación exhaustiva de infraestructura: lint y renderizado de Helm en 6 perfiles, Kubeconform (OpenAPI K8s), Kube-linter, Kyverno CLI (validación de políticas Cosign), Trivy config, Checkov, OpenTofu (`fmt`, `validate`), Ansible-lint y sintaxis de playbooks. |
| `mega-linter.yml` | ⚡ MegaLinter - Quality & Syntax Linters | push/PR a `main` | Análisis de sintaxis complementario usando imagen Cupcake: Hadolint (Dockerfiles), Shellcheck (scripts bash), Actionlint (workflows), Yamllint y Jsonlint. |
| `release-tag.yml` | 🏷️ Automated Semantic Release & Tag | push a `main` | Versionado semántico automático, generación de tag `v*`, release en GitHub con notas de cambio, actualización del `targetRevision` en ArgoCD y creación de PR de promoción GitOps. |
| `security-code-scanning.yml` | 🛡️ Security & Code Scanning SAST | push/PR, cron semanal, manual | Escaneo SAST con njsscan (Express), Hadolint (Dockerfiles) y Trivy IaC (OpenTofu) con publicación de resultados SARIF en GitHub Code Scanning. |
| `security-dast-zap.yml` | 🕷️ OWASP ZAP (DAST Dynamic Security Testing) | cron semanal, manual | Análisis dinámico de seguridad de caja negra (DAST) contra el servidor Pokédex usando OWASP ZAP Baseline Scan. |
| `security-gitleaks.yml` | 🔐 Security Scan (Gitleaks) | push/PR a `main` | Required status check de escaneo de secretos con Gitleaks CLI verificado con SHA256 y publicación SARIF. |
| `security-trivy.yml` | 🛡️ Security Vulnerability Scan (Trivy) | push/PR, cron semanal, manual | Escaneo de vulnerabilidades en sistema de archivos (FS/SCA) e imágenes de contenedor (backend, frontend e imágenes base de infraestructura: postgres, redis, pgbouncer). |
| `performance-k6.yml` | ⚡ Performance & Load Testing (k6) | cron semanal, manual | Pruebas de estrés y rendimiento con Grafana k6 validando SLAs (p95 < 200ms, tasa de error < 1%). |
| `ghcr-retention.yml` | 🧹 GHCR Retention - Prune Older Packages | cron semanal, manual, post-CI | Purga automatizada de versiones antiguas de paquetes de contenedor en GHCR conservando las últimas 3 activas. |
| `github-security-linear-sync.yml` | 📌 Sync GitHub Security & Quality to Linear | post-CI, cron diario, manual, webhooks | Sincronización de alertas de seguridad de GitHub (Dependabot, Code Scanning, Secret Scanning) como tickets en Linear. |
| `renovate-linear-sync.yml` | 📌 Sync Renovate PRs to Linear | PR opened/closed por bots | Crea y actualiza tickets en Linear para seguimiento de Pull Requests de actualización de dependencias generados por Renovate o Dependabot. |
| `sonar-linear-sync.yml` | 📌 Sync SonarCloud Quality & Issues to Linear | post-CI, manual | Sincronización de problemas de calidad y estado del Quality Gate de SonarCloud hacia Linear. |
| `dr-simulation.yml` | 🔄 Disaster Recovery Simulation | cron semanal, manual | Simulacro automatizado de Disaster Recovery ejecutando `scripts/dr_verify_restore.sh --dry-run` contra PostgreSQL real efímero. |

---

## 8. Seguridad y DevSecOps

- **Detección de Secretos:**
  - Gitleaks CLI v8.24.2 con configuración en `.gitleaks.toml` y `.gitleaksignore`.
  - Pre-commit hook de Gitleaks en `.pre-commit-config.yaml`.
  - Workflow obligatorio `security-gitleaks.yml` con publicación SARIF.
- **Análisis Estático (SAST):**
  - Semgrep con reglas automáticas (`ci.yml`).
  - njsscan para patrones de seguridad en Node.js y Express (`security-code-scanning.yml`).
  - SonarCloud para análisis de código, bugs y vulnerabilidades (`sonar-project.properties`).
- **Seguridad en la Cadena de Suministro (Supply Chain & SCA):**
  - Dependency Review Action en Pull Requests (`ci.yml`).
  - `npm audit --audit-level=high` en validaciones y CI.
  - Trivy scanner para detección de CVEs en dependencias y sistema de archivos.
  - Firma criptográfica de imágenes OCI con Sigstore Cosign (Keyless OpenID Connect).
  - Firma criptográfica de Helm Charts empaquetados en formato OCI.
  - Generación y atestación criptográfica de SBOM en formato CycloneDX (`pokedex-sbom.json`).
  - Generación y firma de Procedencia SLSA (Level 3) mediante GitHub Attestations.
  - Digest Pinning en imágenes base (`node:22-alpine@sha256:...`, `nginx:1.31-alpine@sha256:...`, `postgres:16-alpine@sha256:...`, `redis:7-alpine@sha256:...`).
  - SHA pinning inmutable en todas las GitHub Actions de los workflows.
- **Seguridad en Contenedores e Infraestructura (IaC Security):**
  - Hadolint en Dockerfiles (reglas DL3018, DL3025, DL3066).
  - Checkov con políticas para Terraform, Kubernetes y Helm (`.checkov.yaml`).
  - Kube-linter con reglas de privilegios y recursos (`.kube-linter.yaml`).
  - Kubeconform para validación contra esquemas OpenAPI de Kubernetes v1.30.
  - Kyverno CLI y políticas de clúster (`infra/k8s/policies/`) para impedir tags `:latest` y exigir firma Cosign.
- **Análisis Dinámico (DAST) y Pentest:**
  - OWASP ZAP Baseline Scan semanal (`security-dast-zap.yml`).
  - Suite de pentesting automatizado (`tests/pentest.test.ts`).
  - Fuzzing dinámico sobre endpoints REST (`tests/fuzzing.test.ts`).
- **Seguridad en Tiempo de Ejecución (Runtime & Zero-Trust):**
  - Ejecución como usuario sin privilegios (`USER 1000:1000` en backend, `USER 101:101` en frontend).
  - Segmentación de red: redes Docker aisladas (`backend-net` interna sin gateway a internet).
  - Kubernetes NetworkPolicies restringiendo tráfico pod-a-pod.
  - CiliumNetworkPolicy L7 eBPF limitando egress externo exclusivamente a `generativelanguage.googleapis.com` (puerto 443) y bloqueando IPs privadas/Cloud IMDS (`169.254.169.254/32`).
  - Restricción de acceso IP en Nginx para panel `/backoffice` y métricas.
  - Rate limiting distribuido en Redis (`consumeDistributedRateLimit`) y en memoria (`express-rate-limit`).
  - Tokens de sesión firmados con HMAC-SHA256 (32 bytes de entropía), TTL de 8 horas y revocación centralizada en Redis.
  - Sanitización estricta de salidas HTML generadas por IA (`sanitizeAIHtml`) para neutralizar scripts, iframes y handlers inline.

---

## 9. Infraestructura

- **Contenedores y Docker:**
  - `Dockerfile` (raíz / backend mirror) y `apps/backend/Dockerfile`: Multi-stage (builder Node 22 Alpine, runner minimalista sin npm/npx/yarn).
  - `apps/frontend/Dockerfile`: Multi-stage (builder Node 22 Alpine, runner Nginx Alpine con envsubst para allowlist IP).
  - `docker-compose.yml`: Topología DMZ de producción (web, api, postgres, redis).
  - `docker-compose.dev.yml`: Extensión de desarrollo con volúmenes montados, puertos mapeados, Grafana Alloy y cAdvisor.
- **Kubernetes (Helm Chart `infra/helm/pokedex`):**
  - `Chart.yaml`: Versión `1.0.0`, appVersion `1.0.0`.
  - 26 plantillas de recursos en `templates/`:
    - Deployments: `api-deployment.yaml`, `web-deployment.yaml`, `pgbouncer-deployment.yaml`, `redis-deployment.yaml`.
    - StatefulSet: `postgres-statefulset.yaml`.
    - Services: `web-service.yaml`, `postgres-service.yaml`, servicios de API y Redis embebidos.
    - Ingress: `ingress.yaml` (TLS, anotaciones ingress-nginx).
    - Políticas de Red: `network-policies.yaml`, `cilium-network-policies.yaml`.
    - Gobernanza de Recursos: `api-hpa.yaml`, `web-hpa.yaml`, `pdb.yaml`, `resourcequota.yaml`, `limitrange.yaml`.
    - Configuración y Secretos: `configmap.yaml`, `postgres-init-configmap.yaml`, `secret.yaml`, `secretstore.yaml`, `externalsecret.yaml`.
    - Trabajos / Tareas: `seed-job.yaml`, `backup-cronjob.yaml`, `backup-restore-verify-cronjob.yaml`.
    - Observabilidad: `servicemonitor.yaml`.
  - Perfiles de valores: `values.yaml` (base), `values.dev.yaml` (desarrollo/Kind), `values.prod.yaml` (producción endurecida).
- **GitOps y ArgoCD (`gitops/`):**
  - Aplicación raíz: `gitops/apps/root-application.yaml`.
  - Aplicaciones específicas: `gitops/apps/app-proxmox.yaml` y `gitops/apps/app-cloud.yaml`.
  - Valores GitOps: `gitops/environments/aws/values.yaml` y `gitops/environments/proxmox/values.yaml`.
  - Health checks: `gitops/health-checks/argocd-cm-healthchecks.yaml`.
- **Infraestructura como Código con OpenTofu (`infra/opentofu/`):**
  - Entornos: `environments/aws` (EKS, VPC, subnets), `environments/proxmox` (VMs, cloud-init), `environments/lab`, `environments/cloud-template`.
  - Módulos reutilizables: `modules/compute`, `modules/naming`, `modules/security_baseline`, `modules/tagging`.
- **Configuración de Hosts con Ansible (`infra/ansible/`):**
  - Playbooks: 9 playbooks para baseline, preparación, hardening UFW, bastión, setup de K3s, PBS backups y Vault.
  - Roles: `base_os`, `container_runtime`, `firewall`, `hardening`, `kubernetes_prerequisites`.
  - Inventario: `inventory/hosts.ini`.
- **Clúster Local Kind (`infra/k8s/kind-cluster.yaml`):**
  - Configuración para clúster local de desarrollo con mapeo de puertos `80`, `443`, `3000`, `8080`.

---

## 10. Documentación

El repositorio cuenta con una extensa base documental estructurada bajo `docs/` y en la raíz:

- **Documentación Raíz:**
  - `README.md`: Documentación principal del monorepo (arquitectura, setup, comandos y despliegue).
  - `SECURITY.md`: Política de seguridad, reporte de vulnerabilidades y controles DevSecOps.
  - `metadata.json`: Metadatos de la aplicación.
- **Arquitectura (`docs/architecture/` - 15 documentos):**
  - `ANALISIS_LENGUAJES_Y_MEJORES_PRACTICAS.md`
  - `APPLICATION_LIFECYCLE.md`
  - `CLOUD_INFRASTRUCTURE_DESIGN.md`
  - `DATABASE_ANALYSIS.md`
  - `DECLARED_VS_RENDERED_ARCHITECTURE_ANALYSIS.md`
  - `END_TO_END_COHERENCE_AUDIT.md`
  - `FAIL_OPEN_VS_FAIL_CLOSED_CONTRACTS.md`
  - `KUBERNETES_NAMESPACE_TAXONOMY.md`
  - `KUBERNETES_SCALING_ANALYSIS.md`
  - `MOCKUPS_Y_DISENO_UI.md`
  - `MONOREPO_STRUCTURE.md`
  - `ONPREM_SPOF_AND_FAILURE_DOMAIN_ANALYSIS.md`
  - `RESPONSIBILITY_MATRIX.md`
  - `SECRETS_MANAGEMENT_SEALED_SECRETS.md`
  - `SECURITY_AND_NETWORK_ISOLATION.md`
- **Decisiones Arquitectónicas (`docs/decisions/` - 27 ADRs):**
  - `ADR-001` a `ADR-027` cubriendo desde el runtime de Kubernetes, GitOps con ArgoCD, OpenTofu/Ansible boundaries, gestión de secretos, Disaster Recovery, observabilidad, supply chain, contratos AI, ORM Drizzle, Zero-Trust, HPA/PDB, ciclo de vida de pods, TLS/HTTP hardening, Kyverno, OpenTelemetry, gobernanza de scripts y modelo de resiliencia.
- **Operaciones y Runbooks (`docs/operations/` y `docs/runbooks/` - 17 documentos):**
  - Operaciones: `backup-restore.md`, `capacity-and-quotas.md`, `deployment.md`, `GHCR_RETENTION_POLICY.md`, `incident-response.md`, `kubernetes-troubleshooting.md`, `observability-alerts.md`, `OFFSITE_BACKUP_BLUEPRINTS.md`, `rollback.md`, `secret-rotation.md`, `TASKFILE_CLI_REFERENCE.md`.
  - Runbooks: `BREAK_GLASS_PROCEDURE.md`, `DISASTER_RECOVERY_PLAN.md`, `HELM_DEPLOYMENT_GUIDE.md`, `KUBERNETES_AUTOSCALING_GUIDE.md`, `PROXMOX_DEPLOYMENT_GUIDE.md`, `STRESS_TESTING_GUIDE.md`.
- **DevOps y Guías de Flujo (`docs/devops/` - 3 documentos):**
  - `GIT_BRANCHING_AND_MERGE_WORKFLOW.md`, `GITHUB_WORKFLOWS_GUIDE.md`, `TOOLS_AND_TECH_STACK.md`.
- **Seguridad (`docs/security/` - 2 documentos):**
  - `DEVSECOPS_AUDIT.md`, `SECURITY_RUNBOOK.md`.
- **Especificación de API (`docs/api/API_SPECIFICATION.md`):**
  - Contratos detallados de todos los endpoints REST, códigos de estado y esquemas JSON.

---

## 11. Observabilidad y Telemetría

- **Logging Estructurado:**
  - Logger centralizado Pino (`pino@^10.3.1`) configurado en `apps/backend/src/utils/logger.ts`.
  - Formato JSON estructurado para ingesta directa por Grafana Loki.
  - Sanitización contra Log Injection (CWE-117) mediante `sanitizeLogString`.
  - Middleware de trazabilidad de solicitudes (`src/middleware/request-tracer.ts`) inyectando `X-Request-ID`.
- **Métricas de Aplicación:**
  - Endpoint `/metrics` nativo en el backend exponiendo formato de texto estándar de Prometheus.
  - Métricas expuestas: contadores de solicitudes por método, ruta y código de respuesta (`http_requests_total`), histogramas de duración de solicitudes (`http_request_duration_seconds`) con buckets estándar, métricas de estado de almacenamiento (`pokedex_storage_status`, `pokedex_degraded_mode`) y memoria del proceso.
- **Health Checks y Sondas:**
  - `/healthz`: Liveness probe (HTTP 200 rápido).
  - `/readyz`: Readiness probe que evalúa si el servidor está en proceso de shutdown (`isShuttingDown`), disponibilidad de PostgreSQL y estado de Redis.
- **Agentes y Colectores:**
  - Grafana Alloy (`grafana/alloy:v1.7.1`) con configuración unificada en `infra/monitoring/alloy/config.alloy`.
  - Envío de métricas mediante Prometheus Remote Write (`GRAFANA_CLOUD_PROMETHEUS_URL`).
  - Envío de logs mediante Loki Push API (`GRAFANA_CLOUD_LOKI_URL`).
  - cAdvisor (`gcr.io/cadvisor/cadvisor:v0.49.1`) en perfil local para métricas de contenedores Docker.
  - Script PowerShell para despliegue automatizado de telemetría: `infra/monitoring/deploy-grafana-cloud.ps1`.
- **Reglas de Alerta (`infra/monitoring/alerts.yml`):**
  - Alertas críticas: `PokedexPostgresDisconnected`, `PokedexDegradedMode`, `PokedexAPIDown`, `PokedexRedisDisconnected`.
  - Alertas de rendimiento y errores: `PokedexHighErrorRate5xx` (> 5% de errores en 5m), `PokedexHighLatencyP95` (> 200ms en 5m), `ContainerHighMemoryUsage`.
- **Dashboards de Grafana (`infra/monitoring/dashboards/`):**
  - `cluster-observability.json`: Métricas de nodos, pods, CPU, memoria y saturación de red.
  - `pokedex-application.json`: Métricas de negocio, throughput, latencia p95/p99, tasa de error y estado de almacenamiento.

---

## 12. Base de Datos y Persistencia

- **Motor:** PostgreSQL 16 (contenedor oficial Alpine con digest OCI inmutable).
- **ORM & Query Layer:** Drizzle ORM (`drizzle-orm@^0.45.2`) y Drizzle Kit (`drizzle-kit@^0.31.10`).
- **Esquema (`apps/backend/src/db/schema.ts`):**
  - Secuencia `pokedex_id_seq` iniciando en `1009` para evitar colisiones con el dataset oficial inicial de Pokémon.
  - Tabla `pokedex_entries`: `id` (integer PK), `nombre` (varchar 100), `tipo` (varchar 50), `data` (jsonb conteniendo el payload completo del Pokémon), `updated_at` (timestamp with time zone).
  - Índices: `idx_pokedex_tipo`, `idx_pokedex_nombre`.
- **Migraciones:**
  - Directorio: `apps/backend/src/db/migrations/`.
  - Archivo inicial: `0000_greedy_luckman.sql`.
  - Ejecutor: `apps/backend/src/db/migrate.ts` (invocado vía `npm run db:migrate`).
- **Inicialización y Siembra (Seeds):**
  - Script Node.js: `apps/backend/src/seed.ts` (carga inicial idempotente de 1008 Pokémon de primera a novena generación).
  - Script SQL local: `infra/docker/postgres/init.sql`.
  - Kubernetes Job: `infra/helm/pokedex/templates/seed-job.yaml`.
- **Connection Pooling:**
  - Conexión por pool nativo de `pg` (`Pool` de `pg@^8.23.0`).
  - Soporte opcional para PgBouncer desplegado como proxy de conexión frente a Postgres en K8s.
- **Caché y Datos Efímeros (Redis 7):**
  - Almacenamiento en memoria para tokens de sesión activos y contadores de rate limiting.
- **Disaster Recovery (DR) y Backups:**
  - Script automatizado: `scripts/dr_verify_restore.sh`.
  - Snapshots diarios cifrados con AES-256-CBC con derivación PBKDF2 y validación SHA-256.
  - RTO medido < 5 segundos en contenedor de validación; RPO de 24 horas.

---

## 13. Configuración y Variables de Entorno

Basado en la plantilla canónica `.env.example`:

- **Entorno y Servidor:**
  - `NODE_ENV`: `development` | `production` | `test`
  - `PORT`: Puerto HTTP del backend (por defecto `3000`).
  - `WEB_PORT`: Puerto HTTP del frontend (por defecto `8080`).
  - `APP_VERSION`, `GIT_SHA`, `COMMIT_SHA`: Inyectados por CI/CD para metadatos de versión.
- **Credenciales Administrativas y Seguridad:**
  - `ADMIN_API_KEY`: Clave API para operaciones privilegiadas (mínimo 32 caracteres).
  - `ADMIN_SESSION_SECRET`: Secreto HMAC para firma de tokens de sesión.
  - `ADMIN_ALLOWED_IPS`: Lista de IPs permitidas para acceso a `/backoffice`.
  - `CORS_ORIGINS`: Lista de orígenes autorizados para CORS en producción.
- **Base de Datos PostgreSQL:**
  - `DATABASE_URL`: URI de conexión completa con precedencia.
  - `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`.
  - `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED`: Configuración de TLS para la base de datos.
- **Redis:**
  - `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`.
- **Google Gemini AI:**
  - `AI_API_KEY` / `GEMINI_API_KEY`: Credenciales de acceso a Google AI Studio.
  - `GEMINI_MODEL`: Modelo a utilizar (por defecto `gemini-2.5-flash`).
- **Flags Operativas:**
  - `ENABLE_REPO_DOWNLOAD`: Habilitación explícita del endpoint de descarga.
  - `SKIP_ENV_CHECK`: Salteo de validaciones de arranque (solo para CI).
  - `FORCE_SEED`: Fuerza siembra aunque existan registros previos.
- **Nginx Frontend (envsubst):**
  - `BACKOFFICE_ALLOWED_IP_1`, `BACKOFFICE_ALLOWED_IP_2`, `METRICS_ALLOWED_CIDR`.
- **Observabilidad (Grafana Cloud):**
  - `OTEL_EXPORTER_OTLP_ENDPOINT`, `GRAFANA_CLOUD_PROMETHEUS_URL`, `GRAFANA_CLOUD_PROMETHEUS_USER`, `GRAFANA_CLOUD_LOKI_URL`, `GRAFANA_CLOUD_LOKI_USER`, `GRAFANA_CLOUD_TOKEN`.

---

## 14. Comandos Operativos Disponibles

### Interfaz Canónica CLI (Taskfile & NPM)

- **Instalación:**
  - `npm ci` / `task install`: Instalación limpia y determinista de dependencias del monorepo.
- **Desarrollo:**
  - `npm run dev` / `task dev`: Inicia servidor backend en modo desarrollo.
  - `task dev:compose`: Levanta stack interactivo local con Docker Compose.
  - `task dev:compose:down`: Detiene stack interactivo de Docker Compose.
  - `task dev:k8s:up`: Crea clúster Kind local y despliega Helm chart.
  - `task dev:k8s:down`: Destruye clúster Kind local.
- **Compilación y Build:**
  - `npm run build` / `task build`: Compila backend (esbuild) y frontend (Vite).
  - `task turbo:build`: Compilación coordinada con Turborepo.
- **Calidad y Verificación:**
  - `npm run lint` / `task lint`: Verificación estática de tipos en todos los workspaces.
  - `npm run typecheck` / `task typecheck`: Comprobación de tipos con `tsc --noEmit`.
  - `npm run validate` / `task validate`: Validación completa de build, linter, tests y fuzzing.
  - `task lint:mega`: Ejecuta MegaLinter localmente mediante contenedor Docker.
- **Testing:**
  - `npm test` / `task test`: Ejecuta pruebas unitarias y de integración.
  - `npm run test:e2e` / `task test:e2e`: Pruebas E2E con Playwright.
  - `npm run test:a11y` / `task test:a11y`: Pruebas de accesibilidad Axe-core WCAG.
  - `npm run test:coverage` / `task test:coverage`: Generación de reporte de cobertura LCOV.
  - `task perf`: Pruebas de carga y estrés con k6.
  - `npm run perf:lighthouse` / `task perf:lighthouse`: Auditoría de rendimiento con Lighthouse CI.
- **Seguridad:**
  - `task security`: Auditoría de dependencias (`npm audit --audit-level=high`).
  - `task secrets:scan`: Escaneo de secretos local con Gitleaks CLI.
  - `npm run test:security:egress`: Pruebas de políticas de filtrado egress L7 eBPF.
  - `npm run probe:security:egress`: Sonda activa de seguridad de egress.
  - `npm run secrets:audit-rotation`: Auditoría de rotación de credenciales y Reloader.
- **Base de Datos:**
  - `npm run seed`: Siembra inicial del catálogo de Pokémon.
  - `npm run db:generate`: Genera archivos de migración Drizzle.
  - `npm run db:migrate`: Aplica migraciones Drizzle pendientes.
  - `npm run db:studio`: Abre Drizzle Studio.
- **Kubernetes y Helm:**
  - `task k8s:up`: Despliega o actualiza la plataforma en Kubernetes mediante Helm 3.
  - `task k8s:down`: Desinstala el release Helm `pokedex`.
  - `task k8s:status`: Muestra pods, servicios, HPA e ingress en el namespace `pokemon-app`.
  - `task helm:lint`: Validación y linter del Helm Chart.
  - `task helm:template:prod`: Renderizado de manifiestos con perfil de producción.
  - `task helm:package`: Empaqueta chart Helm en archivo `.tgz`.
- **GitOps y ArgoCD:**
  - `task gitops:apps:root`: Aplica aplicación raíz de ArgoCD (patrón App-of-Apps).
  - `task gitops:apps`: Aplica manifiestos declarativos de ArgoCD (Proxmox y Cloud).
  - `task gitops:pin`: Actualiza el `targetRevision` en manifiestos de ArgoCD.
  - `task gitops:verify-parity`: Valida paridad de digests criptográficos entre entornos.
- **Infraestructura como Código (OpenTofu):**
  - `task infra:fmt`: Verifica formato canónico en módulos y entornos OpenTofu.
  - `task infra:validate`: Valida sintaxis de entornos Proxmox, AWS y Lab.
  - `task infra:plan:proxmox` / `task infra:apply:proxmox`: Plan y aplicación en Proxmox.
  - `task infra:plan:aws` / `task infra:apply:aws`: Plan y aplicación en AWS EKS.
- **Gestión de Hosts (Ansible):**
  - `task ansible:syntax`: Valida sintaxis de playbooks y roles.
  - `task ansible:prepare`: Aprovisionamiento base y runtime de contenedores.
  - `task ansible:harden`: Hardening de seguridad y reglas UFW en hosts.
  - `task ansible:validate`: Comprobaciones de auditoría sin alteración de estado.
- **Disaster Recovery:**
  - `task dr:drill`: Simulacro automatizado en seco (dry-run).
  - `task dr:verify`: Verificación criptográfica y restauración real del último snapshot.

---

## 15. Evidencia Factual y Fuentes

- **Identidad y Monorepo:**
  - `package.json`: Líneas 1-10 (definición de nombre, versión `1.0.0`, packageManager `npm@11.17.0`, workspaces `apps/backend`, `apps/frontend`).
  - `.tool-versions`: Líneas 1-5 (definición de versiones declaradas de Node, OpenTofu, Helm, Kubectl y Ansible).
- **Stack Frontend Real vs Declarado:**
  - `apps/frontend/package.json`: Líneas 13-20 (dependencias `dompurify`, `vite`, ausencia de React).
  - `apps/frontend/src/pokedex.ts`, `apps/frontend/src/backoffice.ts`: Implementación en TypeScript nativo sin frameworks de UI.
  - `.github/workflows/web.yml`: Línea 2 (declaración explícita del pipeline: `JS Vanilla + HTML5 + CSS3`).
- **Workflows y Automatización:**
  - `.github/workflows/`: 16 archivos identificados y verificados en disco.
  - `.github/workflows/ci.yml`: Líneas 26-104 (Quality Gates), 108-164 (Docker build), 168-215 (Trivy y SBOM), 218-373 (Publicación GHCR, Helm OCI, firmas Cosign y procedencia SLSA).
- **Persistencia y Base de Datos:**
  - `apps/backend/src/db/schema.ts`: Líneas 1-28 (definición de esquema `pokedex_entries`, secuencia `pokedex_id_seq` y tipos).
  - `apps/backend/src/db/migrations/0000_greedy_luckman.sql`: Líneas 1-11 (sentencias DDL reales de PostgreSQL).
- **Seguridad y Reglas Zero-Trust:**
  - `.gitleaks.toml`: Líneas 1-52 (configuración, allowlists y firmas de Gitleaks).
  - `infra/helm/pokedex/templates/cilium-network-policies.yaml`: Líneas 1-60 (reglas L7 eBPF limitadas al FQDN de Gemini).
  - `infra/helm/pokedex/templates/network-policies.yaml`: Líneas 1-150 (bloqueo de IMDS `169.254.169.254/32` y segmentación).
- **Infraestructura y Orquestación:**
  - `Taskfile.yml`: Líneas 1-651 (declaración exhaustiva de tareas y comandos soportados).
  - `infra/helm/pokedex/Chart.yaml` y 26 plantillas en `infra/helm/pokedex/templates/`.
  - `gitops/apps/`: Manifiestos de aplicaciones ArgoCD.
  - `infra/opentofu/`: Estructura modular y entornos.
  - `infra/ansible/`: 9 playbooks y 5 roles.

---

## 16. Limitaciones del Análisis

1. **Entorno de Ejecución Local:** El análisis se ejecutó en un entorno Windows de desarrollo sin conexión directa activa a clústeres remotos de Kubernetes, Proxmox VE ni cuentas de AWS en vivo. Las afirmaciones sobre IaC, Helm y GitOps corresponden a su diseño declarativo, manifiestos y pruebas renderizadas.
2. **Dependencias Externas de Red (AI):** Los servicios de inteligencia artificial dependen de la provisión en runtime de una API Key válida de Google Gemini (`GEMINI_API_KEY`). Si bien el código cuenta con fallback y circuit breaker, la funcionalidad generativa completa requiere conectividad saliente hacia `generativelanguage.googleapis.com`.
3. **Discrepancia Documental Histórica:** Existe una discrepancia entre la documentación histórica (que en algunos documentos de arquitectura o ADRs menciona React) y la implementación factual del frontend (`apps/frontend`), que es Vanilla TypeScript compilado con Vite y empaquetado con Nginx.
4. **Validación de Scripts Legacy:** La gobernanza de scripts (`npm run governance:audit-scripts`) restringe explícitamente los scripts shell a `scripts/dr_verify_restore.sh`. Cualquier otro script shell fuera de esa lista blanca fallará en los Quality Gates.
