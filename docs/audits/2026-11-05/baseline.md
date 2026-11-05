# Auditoría Integral (`full-audit`) — Baseline 2026-11-05

> **Estado:** Histórico (snapshot inmutable; su frescura se evalúa con `audit-freshness.ts`)
>
> **Fecha de captura:** 2026-11-05
>
> **Commit:** `9b577f14eee843e70e8105d7c9a6e26c3f7a0590` (release `v1.119.16`)
>
> **Rama auditada:** `main` (release `v1.119.16`)
>
> [!IMPORTANT]
> Este documento es evidencia histórica del commit auditado. No es SSOT: el estado vigente
> reside en `apps/`, `infra/`, `gitops/`, `scripts/`, `tests/` y `docs/architecture/`.
> El estado de cada hallazgo se sigue fuera del snapshot (issue con título `AUD-*`).

**Repositorio:** `rocapellino/pokedex`
**Contexto Operativo:** Monorepo (`apps/backend`, `apps/frontend`, `packages/contracts`) | Entornos: Kind / Proxmox Pre-prod (LXC 800) / Prod Cloud (blueprint)
**Vocabulario de estados:** gates según [state-model.md](../../../.agents/skills/_shared/state-model.md) §3 (`PASS`, `FAIL`, `NOT_EXECUTED`, `CI_REQUIRED`).
**Foco de la sesión:** ciclo de auditoría integral de 16 etapas (`full-audit`) que reemplaza el baseline `2026-10-27` (commit `989a6b95`, `v1.119.8`) absorbiendo los commits integrados hasta `v1.119.16` (`9b577f14`), consolidando el estado fáctico de los 4 niveles (SDLC & GitOps) y delimitando la matriz completa de 31 hallazgos y el plan de implementación. Mantiene un único snapshot activo conforme a `max_active_snapshots: 1`.

---

## 1. Identificación y Paridad de Versión

| Componente | Valor auditado | Fuente |
| :--- | :--- | :--- |
| `package.json` | `1.119.16` | Versión de aplicación y monorepo |
| `infra/helm/pokedex/Chart.yaml` (`version` / `appVersion`) | `1.119.16` | Empaquetado Helm |
| GitOps `targetRevision` (manifiestos de `gitops/apps/`) | `v1.119.16` | Promoción ArgoCD (aplicaciones hijas: `app-proxmox-preprod.yaml` y `app-cloud.yaml`) |
| GitOps `targetRevision` (raíz App-of-Apps) | `main` | Orquestador raíz: `gitops/apps/root-application.yaml` (sigue rama `main` por diseño) |

La aplicación raíz de ArgoCD (`root-application.yaml`) mantiene `targetRevision: main` por diseño arquitectónico (ADR-003, enmienda 2026-10-04), mientras las aplicaciones operativas y blueprints (`app-proxmox-preprod.yaml` y `app-cloud.yaml`) fijan inmutablemente `targetRevision: v1.119.16`.

---

## 1. Resumen Ejecutivo

- **Total de Hallazgos:** `31`
- **P0 (Crítico):** `0`
- **P1 (Alto):** `14`
- **P2 (Medio):** `12`
- **P3 (Bajo):** `5`

### Estado de los Cuatro Niveles SDLC & GitOps (`state-model.md` §1)

| Nivel | Referencia Evaluada | Veredicto | Evidencia Fáctica |
| :--- | :--- | :--- | :--- |
| **1. `MAIN`** | `9b577f14` (`v1.119.16`) | `DEGRADED` | Código y gates de gobernanza en verde, pero `Dependabot Updates` falla en cada push (`run 41877959530`) por `GHSA-g3hv-75wg-m249` y existen 14 hallazgos `P1` entre capas. |
| **2. `RELEASE`** | `v1.119.16` (`7e871321`) | `PARTIAL_PASS` | 1. Git Tag firmado Sigstore Gitsign: `PASS`; 2. OCI Image: `PASS` (CI `41705229497`); 3. OCI Digest paridad 1:1 (`sha256:3cd5bec6...` / `sha256:2e6cee3a...`): `PASS`; 4. Cosign Signature: `PASS` en CI (`publish`), regex de verificación en `ci.yaml` mejorable; 5. SBOM CycloneDX: `PASS` en CI, no exigido por Kyverno; 6. SLSA Provenance: `PASS` en CI, no exigido por Kyverno. |
| **3. `GITOPS`** | `proxmox-preprod` / `cloud` | `ALIGNED_PREPROD` / `BROKEN_BLUEPRINT` | `proxmox-preprod` alineado en `v1.119.16` (Flannel L4 + Traefik + ESO `pokedex/preprod`); blueprint `cloud` inactivo pero con `CiliumNetworkPolicy` y `ServiceMonitor` rotos al renderizar, y políticas Kyverno fuera de ArgoCD. |
| **4. `RUNTIME`** | LXC 800 (`10.10.13.100`) | `UNKNOWN` | Sin conexión directa ni telemetría viva al clúster K3s durante esta sesión local (`state-model.md` §4.4). |

### Estado Real de Quality Gates y Controles Ejecutados

| Control / Gate | Estado Estricto | Detalle de Ejecución |
| :--- | :--- | :--- |
| `biome check .` (`lint:code`) | `EXECUTED_SUCCESS` | 352 archivos verificados sin errores. |
| `secrets:audit-rotation` | `EXECUTED_SUCCESS` | 12/12 controles ADR-005 en cumplimiento. |
| `gitops:pin:check` | `EXECUTED_SUCCESS` | Paridad 1:1 en `v1.119.16` (`proxmox-preprod` y `cloud`). |
| `nginx:conf:check` | `EXECUTED_SUCCESS` | `nginx.conf` sincronizado con `nginx.conf.template`. |
| `lint:ignore:strict` | `EXECUTED_SUCCESS` | 7 archivos `.*ignore` evaluados en verde por el gate actual. |
| `lint:yaml:strict` & `lint:docs:refs` | `EXECUTED_SUCCESS` | 0 archivos `.yml` y 0 referencias obsoletas (7 excepciones documentadas). |
| `docs:validate` | `EXECUTED_SUCCESS` | 100% de documentos cumplen enlaces y presupuestos estructurales. |
| `lint:ruleset` | `EXECUTED_SUCCESS` | Paridad total entre `main-protection.json` y GitHub API live. |
| `test:surface:check` | `EXECUTED_SUCCESS` | 196 archivos / 1.304 casos sincronizados con `test-surface.json`. |
| `db:lint-migrations` | `EXECUTED_SUCCESS` | Migración Drizzle conforme a Expand-Contract. |
| `aas:governance` | `EXECUTED_SUCCESS` | AAS Core `18.6.0` válido (8 referencias `reference-only`). |
| `npm audit` | `EXECUTED_FAILED` | **5 vulnerabilidades `moderate`** (`glob` `GHSA-3g3m-2fjr-6pw4` y `minimatch` `GHSA-g3hv-75wg-m249`). |
| `worktree:doctor` | `EXECUTED_FAILED` | 367 archivos auditados OK, pero reporta `[HIGH] WT-NON-CANONICAL-LOCATION` sobre el worktree del host. |
| `typecheck`, `npm test`, `lint:md`, `mcp:validate` | `CI_REQUIRED` | `C:/Users/Rodrigo/Documents/Git/pokedex/node_modules` está vacío en el checkout local (y modo read-only impide `npm ci`); último run de CI en `main` (`41877728645`) en `success`. |
| `helm`, `kubeconform`, `gitleaks`, `trivy` CLI | `NOT_AVAILABLE_LOCAL` | Binarios ausentes en `PATH` local de Windows (`CI_REQUIRED`; Gitleaks `41877728629` y CodeQL `41877728204` en `success` en GitHub). |

### Síntesis de las 16 Etapas Canónicas de `Full-Audit`

| Etapa | Dominio / Skill | Hallazgos Clave |
| :--- | :--- | :--- |
| **1. Inventory** | Inventario y Hotspots | 744 archivos rastreados, 3 workspaces npm (`backend`, `frontend`, `contracts`), 196 archivos en `tests/`, 76 en `scripts/`. Hotspots en `pokedex.ts` (549 LOC) y `pokemon.repository.ts` (464 LOC). |
| **2. Code** | `repo-quality` | Aislamiento estricto de `zod` y `@pokedex/contracts` conforme; detectados fallos fail-open/caché en `pokemon.repository.ts`, bug de precedencia en heartbeat Redis y ancho CSS inválido en `admin-table.ts`. |
| **3. Dependencies** | `repo-dependencies` | 5 CVEs moderados (`glob`, `minimatch`) rompen `Dependabot Updates` en `main`; override huérfano `tmp` y copia escapada `js-yaml@4.3.2`. |
| **4. Testing** | `repo-testing` | 1.304 tests (56% Policy-as-Test, 42% App Tests); `coverage:gate` ignora `middleware/`, `validation/` y `frontend/`, y E2E Playwright no pasa por Nginx ni prueba mutaciones CRUD. |
| **5. Security** | `repo-security` | Bypasses en `validateImageUrl` (`https://localhost` en prod, IPv4-mapped IPv6 hex), rate limiters de auth/CRUD sin `failClosedOnRedisOutage`, split-brain `REDIS_HOST` vs `REDIS_URL`, logout sin CSRF/`Secure` y `rejectUnauthorized: false` en PG TLS. |
| **6. Infrastructure** | `repo-architecture` | `CiliumNetworkPolicy` bloquea Ingress directo a API; 3 CronJobs sin `seccompProfile`; `dr-restore-verify` apunta a `pokedex-secrets`; `setup_k3s.yaml` e inventarios `lab` desalineados con Proxmox real. |
| **7. CI/CD** | `repo-ci` | Job `publish` publica y firma en GHCR sin esperar `sonarcloud` (tests), `frontend-web` ni `infra`; `dr-simulation.yaml` reporta éxito con `if: always()`; políticas Kyverno fuera de ArgoCD. |
| **8. Change Impact** | `repo-impact` | `.agents/**` solo dispara `documentation` (omitiendo TS/evals); `helm`, `opentofu` y `ansible` omiten `tests: true`; 47 archivos caen en `unknown` (incluyendo todo `packages/contracts/**`). |
| **9. Documentation** | `repo-docs` | `README.md` documenta `:3000` inaccesible en Compose; `docs/README.md` omite `ADR-031`; drift fáctico en 6 documentos de `docs/architecture/` y en `ADR-003`, `ADR-006`, `ADR-010` y `ADR-014`. |
| **10. Scripts** | `repo-maintenance` | 0 scripts huérfanos (`DELETE = 0`), pero 4 scripts sin tests directos, duplicación GraphQL Linear y rutas erróneas en `taskfiles/dev.yaml`. |
| **11. Config Hygiene** | `configuration-hygiene` | `apps/backend/.dockerignore` y `apps/frontend/.dockerignore` son 100% inefectivos por `context: .`; rutas muertas en `.gitleaks.toml` y `skip-path` sin justificar en `.checkov.yaml`. |
| **12. Issues / Debt** | Backlog & Deuda | Issue `#586` (Renovate Dashboard) y alerta Dependabot `#28` abiertos; 0 `TODO`/`FIXME` en código; sombreado de tipos de `@pokedex/contracts` en frontend/backend. |
| **13. Skills** | Gobernanza `.agents/` | 4 skills ausentes en `.agents/README.md` y `change-impact-matrix.md`; `db-drizzle-ops` documenta columna `fuerza` e índice GIN inexistentes; contradicción en `.mcp/README.md` sobre `infrastructure-write`. |
| **14. Cleanup** | Higiene & Worktrees | Checkout principal limpio, pero `tmp/` retiene el script sin versionar `tmp/delete-draft-releases.ts` (231 LOC) + logs, y existe el worktree no canónico `.gemini/antigravity/worktrees/...`. |
| **15. Architecture** | Coherencia Sistémica | Trazado salto por salto completado: `proxmox-preprod` opera íntegro bajo Traefik + Flannel, pero Compose sufre spoofing `X-Forwarded-For` y `403` en `/backoffice`, y el blueprint `cloud` está roto en red/métricas. |
| **16. Consolidated** | Este Artefacto | Consolidación trazable bajo taxonomías registradas en `state-model.md` §3 y validada contra `.markdownlint.json`. |

---

## 2. Matriz de Hallazgos

| ID | Área | Evidencia (`ruta:línea`) | Riesgo / Impacto | Prioridad | Confianza | Esfuerzo | Recomendación / Acción |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| `AUD-SEC-URLVAL-001` | Seguridad App | `apps/backend/src/validation/network-security.ts:L65-L76,L123-L128` | Bypass del validador Anti-SSRF en `NODE_ENV=production` con `https://localhost`, `https://127.0.0.1`, `[::ffff:169.254.169.254]` (hex WHATWG), NAT64 y `localhost.` | `P1` | `HIGH` | `S` | Eliminar cortocircuito HTTPS loopback en prod, normalizar punto DNS final y decodificar `::ffff:` hex + `64:ff9b::/96` |
| `AUD-SEC-RLREDIS-001` | Seguridad / ADR-027 | `apps/backend/src/middleware/rate-limiter.ts:L64,L98-L99`; `apps/backend/src/services/auth.ts:L152,L235` | `authRateLimiter` y `mutationRateLimiter` degradan fail-open ante caída de Redis; `REDIS_HOST` sin `REDIS_URL` desactiva todos los guardias fail-closed | `P1` | `HIGH` | `S` | Activar `failClosedOnRedisOutage: true` en auth/CRUD y centralizar `isRedisConfigured()` contemplando `REDIS_URL \|\| REDIS_HOST` |
| `AUD-DB-SEEDPOOL-001` | Persistencia / ADR-011 | `apps/backend/src/seed.ts:L37,L73-L81`; `infra/helm/pokedex/templates/seed-job.yaml:L59-L68`; `externalsecret.yaml:L28-L85` | `seed.ts` y `seed-job` ignoran `DIRECT_DATABASE_URL` (pasan por PgBouncer `:6432`) y reportan éxito falso sobre `memoryMap` si PG falla en modo `sample` | `P1` | `HIGH` | `S` | Conectar `seed.ts` vía `getDirectDatabaseUrl()` abortando si PG no conecta, y forzar `POSTGRES_HOST=postgres-service` en `seed-job.yaml` |
| `AUD-DB-FAILOPEN-001` | Persistencia / ADR-027 | `apps/backend/src/services/postgres.ts:L226-L228`; `apps/backend/src/services/pokemon.repository.ts:L82-L108,L150-L160` | `isPgConfigured()` ignora `POSTGRES_*` habilitando escrituras CRUD volátiles si cae PG; fallos SQL en prod caen a `memoryMap` (35 ítems) y envenenan Redis | `P1` | `HIGH` | `M` | Evaluar `Boolean(getDatabaseUrl())` en `isPgConfigured()`, denegar lecturas fallback en prod (`503`) y no cachear respuestas degradadas en Redis |
| `AUD-INF-CILIUM-001` | Red Zero-Trust | `infra/helm/pokedex/templates/cilium-network-policies.yaml:L13-L21`; `gitops/environments/cloud/values.yaml:L89-L97,L165` | `CiliumNetworkPolicy` solo permite ingreso desde `web`, bloqueando el Ingress directo a `api` (`/api/`, `/pokemons`) y el scraping de `/metrics` en `cloud` | `P1` | `HIGH` | `S` | Alinear `cilium-network-policies.yaml` con `network-policies.yaml` autorizando `ingressController`, `metricsScraper` y salida OTLP |
| `AUD-INF-CRONSEC-001` | K8s / DR / Kyverno | `infra/helm/pokedex/templates/backup-cronjob.yaml:L43-L58`; `backup-gdrive-cronjob.yaml:L24-L39`; `backup-restore-verify-cronjob.yaml:L24-L56` | Los 3 CronJobs omiten `seccompProfile` (rechazados por PSA `restricted` / Kyverno `Enforce`) y `dr-restore-verify` busca `pokedex-secrets` inexistente en dev/Kind | `P1` | `HIGH` | `XS` | Añadir `seccompProfile: { type: RuntimeDefault }`, usar `include "pokedex.secretName"` y validar `rendered-*.yaml` con Kyverno en CI |
| `AUD-INF-TRUSTPROXY-001` | Bordes HTTP / Proxy | `apps/backend/server.ts:L50,L178`; `apps/frontend/nginx.conf.template:L15,L72-L77`; `docker-compose.yaml:L143-L146` | Spoofing de `X-Forwarded-For` en Compose (`172.18.0.1` no está en `set_real_ip_from` pero sí en `uniquelocal`), `403` en `/backoffice` en Compose/Kind y ausencia de ACL IP en `/api/v1/auth/*` en K8s | `P1` | `HIGH` | `M` | Fijar subred `172.28.0.0/16` en `pokedex-net`, acotar `trust proxy` por saltos/CIDR explícito y parametrizar CIDRs de `/backoffice` en Compose/Kind |
| `AUD-IAC-ANSK3S-001` | IaC Ansible & Tofu | `infra/ansible/playbooks/setup_k3s.yaml:L51-L57,L144-L150`; `infra/opentofu/environments/lab/main.tf:L60-L65`; `infra/ansible/inventories/lab/hosts.yaml:L24-L35` | `setup_k3s.yaml` instala Cilium y desactiva `servicelb`/`local-storage` sin sustituto (incompatible con LXC 800), y `opentofu/lab` (`10.0.10.x`) diverge de `ansible/lab` (`10.10.14.x`) | `P1` | `HIGH` | `M` | Parametrizar perfil `lxc-flannel` vs `vm-cilium` en `setup_k3s.yaml` y unificar IPs/usuario entre OpenTofu `lab` y Ansible `lab` |
| `AUD-CI-PUBDAG-001` | CI/CD & Supply Chain | `.github/workflows/ci.yaml:L507`; `.github/workflows/release-tag.yaml:L386-L435` | `publish` sube y firma imágenes/chart en GHCR en `main` sin esperar a `sonarcloud` (tests), `frontend-web` (E2E) ni `infra` (Kind), permitiendo promover releases rotos | `P1` | `HIGH` | `M` | Reestructurar el DAG para que `publish` dependa del `Quality Gate` completo de `change-impact.yaml` antes de firmar y promover en `release-tag.yaml` |
| `AUD-CI-IMPACT-001` | Motor Impacto CI | `.github/ci-impact.yaml:L104,L177-L217` | Cambios en `.agents/**/*.ts` (`tool-exec.ts`, `evals/*.test.ts`) solo corren `docs-gate`; cambios en `_helpers.tpl`, `.tf` y `ansible.cfg` omiten `tests: true` | `P1` | `HIGH` | `S` | Separar `.agents/**/*.ts` y `.agents/evals/**` hacia `tests`/`linting`/`sast`, y activar `tests: true` en `helm`, `opentofu` y `ansible` |
| `AUD-DEP-SCA-001` | Dependencias / SCA | `package.json:L112-L131`; `package-lock.json`; GitHub Alert `#28` (`run 41877959530`) | 5 vulnerabilidades `moderate` (`minimatch` `GHSA-g3hv-75wg-m249` y `glob` `GHSA-3g3m-2fjr-6pw4`) bloquean con error `Dependabot Updates` en cada push a `main` | `P1` | `HIGH` | `S` | Añadir overrides compatibles para `minimatch` (`>=11.0.1` / `3.1.5` según subárbol) y `glob` (`>=14.0.2`), o actualizar `@sentry/node` y `markdownlint-cli` |
| `AUD-CFG-DOCKERIGN-001` | Config Hygiene | `apps/backend/.dockerignore:L1-L50`; `apps/frontend/.dockerignore:L1-L48`; `.dockerignore:L1-L101`; `scripts/check-ignore-hygiene.ts:L98-L99` | Los dos `apps/*/.dockerignore` son 100% muertos porque todo build usa `context: .`, mientras `.dockerignore` raíz omite `backups/`, `*.sql*`, `*.enc`, `.agents/` y `.mcp/` | `P1` | `HIGH` | `XS` | Retirar `apps/*/.dockerignore` (o renombrar a `<Dockerfile>.dockerignore` si se usa BuildKit específico), endurecer `.dockerignore` raíz y ajustar `check-ignore-hygiene.ts` |
| `AUD-DOC-DRIFT-001` | Docs & ADRs | `README.md:L125-L126`; `docs/README.md:L173`; `docs/architecture/*.md`; `ADR-003:L34`, `ADR-006:L31,L61`, `ADR-010:L21-L33`, `ADR-014:L24-L30` | Quickstart apunta a `:3000` cerrado en Compose; cheat sheet K8s usa `app=pokedex-web` inválido; PgBouncer documentado en `:5432`; 4 ADRs activos contradicen código/Helm | `P1` | `HIGH` | `M` | Corregir puertos/selectores en `README.md` y `docs/architecture/`, sincronizar índice de 24 ADRs y enmendar `ADR-003`, `ADR-006`, `ADR-010` y `ADR-014` |
| `AUD-GOV-SKILLS-001` | Skills & Worktrees | `.agents/skills/db-drizzle-ops/SKILL.md:L18-L19`; `.agents/README.md:L48-L69`; `change-impact-matrix.md:L110-L123`; `.gemini/antigravity/worktrees/...` | 4 skills omitidas en matriz/README; `db-drizzle-ops` exige columna `fuerza` e índice GIN inexistentes (sin `CONCURRENTLY`); worktree activo en ubicación no canónica | `P1` | `HIGH` | `S` | Alinear `db-drizzle-ops` con `schema.ts` + `CONCURRENTLY`, registrar las 4 skills en `README.md` y `change-impact-matrix.md`, y limpiar el worktree no canónico |
| `AUD-SEC-AUTHCSRF-001` | Seguridad Auth | `apps/backend/src/routes/auth.ts:L62-L76`; `apps/backend/src/middleware/auth.ts:L138-L142` | `POST /api/v1/auth/logout` omite `; Secure`, no valida CSRF y borra la cookie antes de confirmar revocación en Redis; `validateSessionCsrf` admite `DEFAULT_DEV_CORS_ORIGINS` sin `!isProduction` | `P2` | `HIGH` | `S` | Proteger logout con CSRF, usar atributos simétricos a `buildSessionCookie`, limpiar cookie tras revocar JTI y restringir fallback dev en CSRF |
| `AUD-SEC-HEADERS-001` | Bordes HTTP | `apps/frontend/nginx.conf.template:L161-L171`; `infra/helm/pokedex/values.yaml:L239-L243`; `values.prod.yaml:L117-L121` | `location /metrics` en Nginx duplica las 10 cabeceras de seguridad; `ingress-nginx` sobrescribe CSP sin `object-src 'none'` y `Permissions-Policy` incompleta | `P2` | `HIGH` | `XS` | Añadir `proxy_hide_header` en `location /metrics` de Nginx y alinear `more_set_headers` en `values*.yaml` con la CSP de `server.ts` |
| `AUD-SEC-PGTLS-001` | Seguridad DB | `apps/backend/src/services/postgres.ts:L101-L103`; `apps/backend/src/db/migrate.ts:L148-L152` | `postgres.ts` usa `rejectUnauthorized: false` por defecto cuando activa TLS y `migrate.ts` no aplica `shouldUsePgSsl` | `P2` | `HIGH` | `S` | Invertir default a `rejectUnauthorized: true` (permitiendo CA custom vía `NODE_EXTRA_CA_CERTS` / `PGSSLROOTCERT`) y compartir helper SSL en `migrate.ts` |
| `AUD-SEC-INPUT-001` | Validación Input | `apps/backend/src/validation/ai-security.ts:L31,L37`; `apps/backend/src/controllers/pokemon-mapper.ts:L32,L41,L73` | `sanitizeAIHtml` permite `<svg/onload=...>` sin espacio previo y entidades en `href`; `schemas.ts` no valida `body.habitat` en raíz pero `pokemon-mapper.ts` lo prioriza | `P2` | `HIGH` | `S` | Endurecer regex/parser en `sanitizeAIHtml` y validar o ignorar `body.habitat` en nivel raíz a favor de `caracteristicas.habitat` |
| `AUD-INF-EGRESS-001` | Zero-Trust K8s | `infra/helm/pokedex/templates/network-policies.yaml:L5-L11,L225-L233`; `backup-cronjob.yaml:L156`; `values.prod.yaml:L250-L255` | `seed-job` y `dr-restore-verify` sin `NetworkPolicy` de egress; `backup.offsite` abre egress sin `to:` e invoca `aws` CLI ausente; `ServiceMonitor` en `cloud` sin `metricsToken` | `P2` | `HIGH` | `M` | Añadir políticas egress para `db-seeder`/`dr-verification`, restringir `to:` en offsite, configurar `authorization` en `servicemonitor.yaml` y actualizar `infra/k8s/eso/` |
| `AUD-IAC-HARDEN-001` | Hardening IaC | `infra/opentofu/environments/proxmox/main.tf:L26,L37,L50-L53`; `infra/ansible/playbooks/setup_vault.yaml:L422-L538`; `setup_bastion.yaml:L40,L70-L76` | LXC 800 definido con `unprivileged = false`, `swap = 1024` y sin `firewall = true`; Ansible usa `curl \| sh` sin SHA-256 y `setup_vault.yaml` no reconcilia políticas Day-2 y escribe en `infra/k8s/eso/` | `P2` | `HIGH` | `M` | Evaluar LXC sin privilegios o documentar excepción K3s, fijar `swap = 0` y `firewall = true`, verificar SHA-256 en Ansible y mover `vault-ca.crt` a `tmp/` |
| `AUD-CI-GATES-001` | Gobernanza CI/Supply | `.github/workflows/dr-simulation.yaml:L36-L47`; `security-code-scanning.yaml:L82,L106-L114`; `infra/k8s/policies/disallow-latest-tag.yaml:L24-L27` | `dr-simulation.yaml` publica éxito fijo con `if: always()`; `hadolint` (`no-fail: true`) y `trivy-iac` (`exit-code: 0`) no bloquean; políticas Kyverno fuera de ArgoCD y sin `initContainers` | `P2` | `HIGH` | `S` | Condicionar resumen DR al código de salida real, activar fallo bloqueante en `hadolint`/`trivy-iac`, cubrir `initContainers` y gestionar políticas Kyverno en GitOps |
| `AUD-CI-UNKNOWN-001` | Contrato Impacto CI | `.github/ci-impact.yaml:L221,L225,L248,L271-L280,L371-L389` | 47 archivos reales (incl. todo `packages/contracts/**` y 24 scripts de `scripts/`) caen en `unknown` disparando Full CI; `sync_tooling` omite `sast`; 3 rutas fantasma en `ci-impact.yaml` | `P2` | `HIGH` | `S` | Añadir regla `contracts` y mapear los 24 scripts/configs restantes en `.github/ci-impact.yaml`, sumar `sast: true` a `sync_tooling` y purgar rutas inexistentes |
| `AUD-QUAL-CAPAS-001` | Calidad App / UI | `apps/backend/src/services/pokemon.repository.ts:L60-L65`; `db.ts:L21`; `apps/frontend/src/components/admin-table.ts:L146`; `backoffice-actions.ts:L88-L96`; `types.ts:L16-L49` | `?tipo=` ignora tipos secundarios en PG; `db.ts` hace `PING` Redis cada 5s por precedencia `\|\|`; barras de backoffice sin `%` (`width: 0`); `#btnSyncCache` no invalida caché y `types.ts` sombrea `@pokedex/contracts` | `P2` | `HIGH` | `M` | Consultar `data->'tipos'` en PG escapando `%`/`_`, corregir paréntesis en `db.ts:L21`, añadir `%` en `admin-table.ts`, alinear contratos en `@pokedex/contracts` y corregir UI de backoffice |
| `AUD-DEP-HYGIENE-001` | Higiene npm | `package.json:L113-L130`; `package-lock.json` | Override huérfano `"tmp": "^0.2.7"`, escape de `cosmiconfig/node_modules/js-yaml@4.3.2` fuera de overrides anidados y supuesto obsoleto de Zod 3 en `zod_resolution.test.ts` | `P2` | `HIGH` | `XS` | Eliminar override `tmp`, elevar override de `js-yaml` o cubrir `cosmiconfig`, y actualizar comentario/aserto de `tests/unit/zod_resolution.test.ts` |
| `AUD-TST-GAPS-001` | Cobertura & E2E | `scripts/check-coverage-threshold.ts:L27-L30`; `apps/frontend/playwright.config.ts:L17-L29`; `tests/e2e/backoffice.spec.ts:L47-L111`; `nginx_effective_headers.test.ts:L120` | `coverage:gate` omite `middleware/`, `validation/`, `controllers/`, `db/` y `frontend/`; Playwright no pasa por Nginx/PG/Redis ni prueba CRUD en backoffice; test de Nginx excluye `/metrics` | `P2` | `HIGH` | `M` | Ampliar `COVERAGE_GATES` a `middleware/` y `validation/`, agregar flujo CRUD E2E sobre stack con Nginx e incluir `/metrics` en `nginx_effective_headers.test.ts` |
| `AUD-CFG-SECREVIEW-001` | Exclusiones Seg. & MCP | `.gitleaks.toml:L26-L32`; `.checkov.yaml:L4-L6`; `.mcp/README.md:L41,L56`; `tmp/delete-draft-releases.ts` | 4 rutas muertas en allowlist de `.gitleaks.toml`, `skip-path: ["infra/k8s/jobs"]` sin justificar en `.checkov.yaml`, contradicción documental en perfil MCP `infrastructure-write` y script de 231 LOC en `tmp/` | `P2` | `HIGH` | `S` | Acotar/documentar allowlist histórica en `.gitleaks.toml`, justificar o remediar `infra/k8s/jobs` en Checkov, corregir `.mcp/README.md` y decidir destino de `tmp/delete-draft-releases.ts` |
| `AUD-QUAL-HOTSPOTS-001` | Modularidad / Docker | `apps/frontend/src/pokedex.ts:L1-L549`; `pokemon.repository.ts:L1-L464`; `apps/backend/Dockerfile:L76,L85`; `apps/backend/package.json:L20` | Hotspots `>350` LOC en `apps/` y 17 en `scripts/`; UID `1000` en `Dockerfile` vs `10001` en Helm; `@pokedex/contracts` en `dependencies` deja symlink roto en imagen runner | `P3` | `HIGH` | `M` | Mover `@pokedex/contracts` a `devDependencies`, alinear UID `10001` en `Dockerfile` y dividir gradualmente `pokedex.ts` y `pokemon.repository.ts` |
| `AUD-MNT-SCRIPTS-001` | Scripts & Taskfile | `scripts/cleanup-linear-tickets.ts`; `list-linear-issues.ts`; `sonar-linear-sync.ts`; `mcp/setup.ts`; `taskfiles/dev.yaml:L26-L38` | 4 scripts sin tests unitarios directos, cliente GraphQL Linear duplicado en 4 archivos y `taskfiles/dev.yaml` apunta a `data/pokemon-catalog.full.json` inexistente y `:3000` cerrado | `P3` | `HIGH` | `S` | Extraer `scripts/lib/linear.ts`, añadir tests unitarios, corregir rutas/puertos en `taskfiles/dev.yaml` y exponer `audit:freshness` en `package.json` |
| `AUD-TST-SMELLS-001` | Calidad de Tests | `tests/security/app/pentest.test.ts:L492-L523`; `tests/contracts/delivery/tag_retention_remote.test.ts:L1-L1608`; `tests/e2e/pokedex.spec.ts:L151` | 8 God Test Files (`>500` LOC), `assert.ok(true)` en vez de `t.skip` cuando falta Redis en `pentest.test.ts` y esperas fijas `setTimeout`/`waitForTimeout` | `P3` | `HIGH` | `S` | Reemplazar `assert.ok(true)` por `t.skip()`, sustituir sleeps por condiciones deterministas y modularizar los God Test Files |
| `AUD-CI-REDUNDANCY-001` | Eficiencia CI/Hooks | `.github/workflows/change-impact.yaml:L328`; `infra.yaml:L140,L214,L296`; `.pre-commit-config.yaml:L32,L49` | `printf "${FAILED}"` sin formato seguro, Gitleaks `8.24.2` en pre-commit vs `8.30.1` en CI, `biome-check` limitado a `[ts]`, omisión de `rendered-cloud.yaml` en `kube-linter` y 4-5 builds repetidos | `P3` | `HIGH` | `S` | Usar `printf '%s'`, alinear Gitleaks y Biome en `.pre-commit-config.yaml`, incluir `rendered-base/cloud.yaml` en `kube-linter` y reutilizar artefactos de build |
| `AUD-GOV-SKILLCTR-001` | Contrato de Skills | `.agents/skills/{adr-manager,db-drizzle-ops,devsecops-preflight,k8s-gitops-validator,repo-docs}/SKILL.md`; `methodology.md:L72`; `source-of-truth.md:L14` | 5 skills omiten enlace a `skill-contract.md`, `k8s-gitops-validator` usa `docker run alpine/helm:3.22.1` sin `@sha256:` ni `repo-tool-exec`, `methodology.md` omite `packages/contracts` y `source-of-truth.md` cita `inventory/` inexistente | `P3` | `HIGH` | `XS` | Enlazar `skill-contract.md` en las 5 skills, delegar `helm`/`gitleaks` en `repo-tool-exec` y corregir rutas/workspaces en `_shared/` |

---

## 3. Detalle de Hallazgos Significativos (P1)

### `AUD-SEC-URLVAL-001` Bypasses en `validateImageUrl` e `isPrivateOrRestrictedIp` en producción

- **Área:** Seguridad de Aplicación (`apps/backend/src/validation/`)
- **Prioridad:** `P1`
- **Confianza:** `HIGH`
- **Esfuerzo:** `S`
- **Evidencia:** [network-security.ts](../../../apps/backend/src/validation/network-security.ts#L65-L76) y [network-security.ts](../../../apps/backend/src/validation/network-security.ts#L123-L128)
- **Estado actual:** En `L123-L128`, cuando `host === 'localhost' || host === '127.0.0.1'`, la función solo bloquea `http:` en producción y retorna `parsed.protocol === 'https:'` (`true` para `https://localhost/...` y `https://127.0.0.1/...`) antes de invocar `isPrivateOrRestrictedIp(host)`. Adicionalmente, el parser WHATWG `new URL()` de Node.js normaliza direcciones IPv4-mapped IPv6 a hexadecimal (`[::ffff:169.254.169.254]` pasa a `[::ffff:a9fe:a9fe]`), eludiendo la expresión regular decimal `/^::ffff:(\d{1,3}\...)/i` de `L72`. Tampoco se bloquean el prefijo NAT64 `64:ff9b::/96` ni `localhost.` con punto raíz DNS.
- **Riesgo/impacto:** Permite persistir URLs apuntando a IMDS (`169.254.169.254`), loopback y RFC1918 en registros del catálogo en producción. Aunque hoy el servidor no descarga imágenes server-side (`L86-L89`), rompe el contrato defensivo Anti-SSRF declarado y expone a clientes internos (navegador del operador en LAN) o futuros servicios de proxy/thumbnailing.
- **Recomendación:** Eliminar la rama permisiva `https:` para `localhost`/`127.0.0.1` cuando `NODE_ENV === 'production'`, normalizar `.replace(/\.$/, '')` en `hostname`, y parsear `::ffff:` tanto en formato punteado como en par hexadecimal de 32 bits (`::ffff:XXYY:ZZWW`), añadiendo bloqueo de `64:ff9b::/96` y `0:0:0:0:0:0:0:0`.
- **Verificación:** Añadir casos de regresión en `tests/unit/` y `tests/security/` con `NODE_ENV=production` verificando `false` en los cinco vectores.
- **Impacto en documentación:** `Ninguno`

### `AUD-SEC-RLREDIS-001` Rate limiting administrativo sin Fail-Closed y Split-Brain entre `REDIS_HOST` y `REDIS_URL`

- **Área:** Seguridad de Aplicación y Resiliencia (`ADR-027`)
- **Prioridad:** `P1`
- **Confianza:** `HIGH`
- **Esfuerzo:** `S`
- **Evidencia:** [rate-limiter.ts](../../../apps/backend/src/middleware/rate-limiter.ts#L64-L99), [auth.ts](../../../apps/backend/src/services/auth.ts#L152-L240) y [configmap.yaml](../../../infra/helm/pokedex/templates/configmap.yaml#L14-L15)
- **Estado actual:** Solo `aiRateLimiter` y `aiDailyQuotaLimiter` (`L94-L97`) pasan `{ failClosedOnRedisOutage: true }`; `mutationRateLimiter` (`L98`) y `authRateLimiter` (`L99`) degradan a memoria por pod ante caída de Redis, permitiendo login administrativo (`POST /api/v1/auth/session`) y mutaciones con `X-API-Key` durante indisponibilidad de Redis. Además, los tres guardias fail-closed (`rate-limiter.ts:L64`, `services/auth.ts:L152` y `L235`) evalúan `Boolean(process.env.REDIS_URL)` en vez de un helper común que contemple `REDIS_HOST`.
- **Riesgo/impacto:** Incumplimiento directo de la Regla Inquebrantable 1 (`ADR-027`): ante caída de Redis, la protección contra fuerza bruta en autenticación se multiplica por el número de réplicas y, si un entorno se despliega con `REDIS_HOST` sin `REDIS_URL`, se desactiva en silencio la revocación distribuida de sesiones (`JTI`) y el fail-closed de cuotas IA.
- **Recomendación:** Activar `{ failClosedOnRedisOutage: true }` en `authRateLimiter` y `mutationRateLimiter` cuando `NODE_ENV === 'production'` o Redis esté configurado, e introducir `isRedisConfigured()` en `services/cache.ts` evaluando `Boolean(process.env.REDIS_URL || process.env.REDIS_HOST)`.
- **Verificación:** Test de integración simulando caída de Redis sobre `POST /api/v1/auth/session`, `POST /pokemons` (con `X-API-Key`) y configuración exclusiva por `REDIS_HOST`.
- **Impacto en documentación:** `docs/architecture/FAIL_OPEN_VS_FAIL_CLOSED_CONTRACTS.md (pendiente)`

### `AUD-DB-SEEDPOOL-001` Omisión de `DIRECT_DATABASE_URL` y falso éxito silencioso en `seed.ts` / `seed-job.yaml`

- **Área:** Persistencia Relacional y GitOps (`ADR-011`, `ADR-031`)
- **Prioridad:** `P1`
- **Confianza:** `HIGH`
- **Esfuerzo:** `S`
- **Evidencia:** [seed.ts](../../../apps/backend/src/seed.ts#L37-L81), [postgres.ts](../../../apps/backend/src/services/postgres.ts#L15-L21), [seed-job.yaml](../../../infra/helm/pokedex/templates/seed-job.yaml#L59-L68) y [externalsecret.yaml](../../../infra/helm/pokedex/templates/externalsecret.yaml#L28-L85)
- **Estado actual:** `seed.ts:L37` invoca `initStorage()` → `connectPg()`, que usa `getDatabaseUrl()` ignorando `DIRECT_DATABASE_URL`. A la vez, `seed-job.yaml` no sobrescribe `POSTGRES_HOST: "postgres-service"` (como sí hace `migrate-job.yaml:L69-L72`) y `externalsecret.yaml` no proyecta `DIRECT_DATABASE_URL`. Además, si PostgreSQL no conecta y `SEED_DATASET=sample`, `listPersistedPokemonIds()` cae en `memoryMap` (35 Pokémon) y `seed.ts:L73-L81` termina con `process.exit(0)`.
- **Riesgo/impacto:** Incumple la Regla Inquebrantable 3 (`AGENTS.md`): con `pgbouncer.enabled: true` (`values.prod.yaml`), el Job de seeding ejecuta carga masiva y `setval` a través de PgBouncer en modo transacción (`:6432`), y en caso de fallo de red puede reportar el Job de Kubernetes como `Completed` sin haber insertado filas en PostgreSQL.
- **Recomendación:** Hacer que `seed.ts` conecte explícitamente con `getDirectDatabaseUrl()` y falle con `process.exit(1)` si `isPgConnectedStatus()` es `false`; añadir override `POSTGRES_HOST: "postgres-service"` y `POSTGRES_PORT` directo en `seed-job.yaml`, y proyectar `DIRECT_DATABASE_URL` en `externalsecret.yaml`.
- **Verificación:** Test unitario/integración de `seed.ts` verificando `exit(1)` sin PostgreSQL y preferencia de `DIRECT_DATABASE_URL` sobre `DATABASE_URL`.
- **Impacto en documentación:** `Ninguno`

### `AUD-DB-FAILOPEN-001` Escrituras CRUD volátiles con `POSTGRES_*` y envenenamiento de caché Redis ante fallos SQL

- **Área:** Persistencia, Caché y Resiliencia (`ADR-027`)
- **Prioridad:** `P1`
- **Confianza:** `HIGH`
- **Esfuerzo:** `M`
- **Evidencia:** [postgres.ts](../../../apps/backend/src/services/postgres.ts#L226-L228) y [pokemon.repository.ts](../../../apps/backend/src/services/pokemon.repository.ts#L24-L29) (`L82-L108`, `L150-L160`)
- **Estado actual:** (1) `isPgConfigured()` retorna únicamente `Boolean(process.env.DATABASE_URL)` (al igual que el reconector en `db.ts:L18`), ignorando despliegues configurados mediante `POSTGRES_HOST`/`POSTGRES_USER`/`POSTGRES_DB`; si PostgreSQL cae en ese modo, `isWritableStorageAvailable()` devuelve `true` y `POST`/`PUT`/`DELETE /pokemons` mutan `memoryMap` devolviendo `200`/`201`. (2) En `getAllPokemons` y `getPokemonById`, un error SQL en producción cae a `memoryMap` (solo 35 Pokémon iniciales) y acto seguido guarda ese resultado truncado en Redis (`redis.setex` por 60s/300s).
- **Riesgo/impacto:** Pérdida silenciosa de mutaciones administrativas al reiniciar el pod y contaminación multi-pod de la caché compartida de Redis (ocultando ~990 Pokémon y ediciones del backoffice tras un micro-corte de base de datos en producción).
- **Recomendación:** Definir `isPgConfigured()` como `Boolean(getDatabaseUrl())`; en `NODE_ENV === 'production'` (o cuando `isPgConfigured()` sea `true`), propagar `503` ante fallo de lectura SQL en lugar de servir `memoryMap`, y jamás ejecutar `redis.setex` sobre respuestas provenientes del fallback en memoria.
- **Verificación:** Tests de regresión en `tests/unit/` e integración verificando `503` en CRUD con `POSTGRES_HOST` caído y ausencia de escritura en Redis en modo fallback.
- **Impacto en documentación:** `docs/architecture/FAIL_OPEN_VS_FAIL_CLOSED_CONTRACTS.md (pendiente)`

### `AUD-INF-CILIUM-001` `CiliumNetworkPolicy` bloquea el tráfico del Ingress Controller hacia `pokemon-api` y `/metrics`

- **Área:** Infraestructura Kubernetes & Zero-Trust (`ADR-013`)
- **Prioridad:** `P1`
- **Confianza:** `HIGH`
- **Esfuerzo:** `S`
- **Evidencia:** [cilium-network-policies.yaml](../../../infra/helm/pokedex/templates/cilium-network-policies.yaml#L13-L21), [network-policies.yaml](../../../infra/helm/pokedex/templates/network-policies.yaml#L70-L86) y [cloud/values.yaml](../../../gitops/environments/cloud/values.yaml#L89-L97) (`L165`)
- **Estado actual:** `cilium-network-policies.yaml:L13-L21` restringe el ingreso de `app.kubernetes.io/component: api` únicamente a `app.kubernetes.io/component: web`. Sin embargo, todos los manifiestos de Ingress (`values.yaml`, `values.prod.yaml`, `proxmox-preprod/values.yaml`, `cloud/values.yaml`) enrutan `/api/` y `/pokemons` directamente a `pokemon-api-svc:3000`. En `proxmox-preprod` no afecta hoy porque `ciliumNetworkPolicy.enabled: false` (`Flannel`), pero en `values.yaml` base y en el blueprint `cloud` (`ciliumNetworkPolicy.enabled: true`) bloquea el 100% del tráfico externo a la API y el scraping de Prometheus.
- **Riesgo/impacto:** Indisponibilidad total de `/api/` y `/pokemons` y ceguera de métricas al activar Cilium en K3s o al promover el blueprint `cloud`.
- **Recomendación:** Sincronizar `cilium-network-policies.yaml` con `network-policies.yaml` añadiendo reglas `fromEndpoints` parametrizadas para `ingressController` y `metricsScraper`, más el puerto OTLP en `egress` si aplica.
- **Verificación:** Test de paridad semántica en `tests/security/network_policies_security.test.ts` contrastando los sujetos permitidos en `network-policies.yaml` vs `cilium-network-policies.yaml` contra los backends reales de `ingress.yaml`.
- **Impacto en documentación:** `Ninguno`

### `AUD-INF-CRONSEC-001` Omisión de `seccompProfile` en los 3 CronJobs de Backup/DR y Secret erróneo en `dr-restore-verify`

- **Área:** Kubernetes Hardening, Admisión Kyverno y Disaster Recovery (`ADR-006`, `ADR-017`)
- **Prioridad:** `P1`
- **Confianza:** `HIGH`
- **Esfuerzo:** `XS`
- **Evidencia:** [backup-cronjob.yaml](../../../infra/helm/pokedex/templates/backup-cronjob.yaml#L43-L58), [backup-gdrive-cronjob.yaml](../../../infra/helm/pokedex/templates/backup-gdrive-cronjob.yaml#L24-L39), [backup-restore-verify-cronjob.yaml](../../../infra/helm/pokedex/templates/backup-restore-verify-cronjob.yaml#L24-L56) y [require-seccomp-profile.yaml](../../../infra/k8s/policies/require-seccomp-profile.yaml#L16-L37)
- **Estado actual:** Ninguno de los tres CronJobs declara `seccompProfile: { type: RuntimeDefault }`, obligatorio bajo `PodSecurity: restricted` (`namespace-pod-security.yaml:L9`) y la política Kyverno `require-seccomp-profile` (`Enforce`). Adicionalmente, `backup-restore-verify-cronjob.yaml:L49, L56` resuelve `{{ .Values.secrets.existingSecret | default (printf "%s-secrets" (include "pokedex.fullname" .)) }}` (`pokedex-secrets`) en lugar de `{{ include "pokedex.secretName" . }}` (`pokemon-secrets`).
- **Riesgo/impacto:** Bloqueo de admisión de todos los pods de respaldo y verificación DR en cualquier clúster con PSA `restricted` o Kyverno activo, y fallo `CreateContainerConfigError` de `dr-restore-verify` en entornos sin `secrets.existingSecret` explícito (`dev`/`Kind`).
- **Recomendación:** Añadir `seccompProfile: { type: RuntimeDefault }` en los tres CronJobs, reemplazar la referencia al Secret por `{{ include "pokedex.secretName" . }}` y ejecutar `kyverno apply` contra los manifiestos Helm renderizados en `.github/workflows/infra.yaml`.
- **Verificación:** Incluir `CronJob` en `tests/security/k8s_workload_hardening.test.ts` exigiendo `seccompProfile.type == RuntimeDefault` y paridad de nombre de Secret.
- **Impacto en documentación:** `Ninguno`

### `AUD-INF-TRUSTPROXY-001` Spoofing de `X-Forwarded-For` en Docker Compose y bloqueo `403` de `/backoffice` en Compose/Kind

- **Área:** Seguridad de Red, Proxy Inverso y Configuración Multi-Entorno
- **Prioridad:** `P1`
- **Confianza:** `HIGH`
- **Esfuerzo:** `M`
- **Evidencia:** [server.ts](../../../apps/backend/server.ts#L50), [nginx.conf.template](../../../apps/frontend/nginx.conf.template#L13-L16) (`L72-L77`), [docker-compose.yaml](../../../docker-compose.yaml#L7-L26) (`L143-L146`) y [pokemons.ts](../../../apps/backend/src/routes/pokemons.ts#L78)
- **Estado actual:** En `docker-compose.yaml`, la red `pokedex-net` no fija subred IPAM (Docker asigna `172.18.0.0/16` típico), fuera de `set_real_ip_from 172.28.0.0/16` en `nginx.conf.template:L15`. Al entrar desde el gateway `172.18.0.1`, Nginx conserva el `X-Forwarded-For` enviado por el cliente y añade `172.18.0.1`; luego Express (`trust proxy: ['loopback', 'linklocal', 'uniquelocal']` en `server.ts:L50`) confía en ambos saltos y adopta la IP falsificada como `req.ip`. En sentido inverso, `GET /backoffice` en Nginx sólo permite `127.0.0.1`, `10.42.0.1/32` y `192.168.1.50/32` por defecto, devolviendo `403` al host en Docker Compose y en Kind (`10.244.0.0/16`). Además, en K8s las rutas `/api/v1/auth/*` y `/pokemons` saltan Nginx y no pasan por `adminIpRestricted` (`server.ts:L178` solo cubre `GET /admin|/backoffice`).
- **Riesgo/impacto:** Evasión trivial de rate limiting por IP en Docker Compose (y ante clientes RFC1918 internos con múltiples saltos) e inoperancia de la consola `/backoffice` a través de Nginx en entornos locales/Kind.
- **Recomendación:** Declarar IPAM explícito en `pokedex-net` alineado con `set_real_ip_from`, parametrizar `TRUST_PROXY` en Express (ej. conteo exacto de saltos `1` en K8s/Compose o CIDRs explícitos de proxy), inyectar `BACKOFFICE_ALLOWED_IP_*` apropiados en `docker-compose*.yaml` / `values.dev.yaml` y aplicar `adminIpRestricted` opcionalmente en `/api/v1/auth/session` cuando `ADMIN_ALLOWED_IPS` esté definido.
- **Verificación:** Test de integración levantando Nginx + Express y enviando `X-Forwarded-For: 1.2.3.4` para certificar que `req.ip` no puede falsificarse.
- **Impacto en documentación:** `README.md (pendiente)`

### `AUD-IAC-ANSK3S-001` Incompatibilidad de `setup_k3s.yaml` con LXC 800 y divergencia entre OpenTofu `lab` y Ansible `lab`

- **Área:** Infraestructura como Código (`infra/ansible/`, `infra/opentofu/`)
- **Prioridad:** `P1`
- **Confianza:** `HIGH`
- **Esfuerzo:** `M`
- **Evidencia:** [setup_k3s.yaml](../../../infra/ansible/playbooks/setup_k3s.yaml#L51-L57) (`L144-L150`), [proxmox-preprod/values.yaml](../../../gitops/environments/proxmox-preprod/values.yaml#L174-L193), [lab/main.tf](../../../infra/opentofu/environments/lab/main.tf#L60-L65) y [lab/hosts.yaml](../../../infra/ansible/inventories/lab/hosts.yaml#L24-L35)
- **Estado actual:** `setup_k3s.yaml` instala K3s con `--flannel-backend=none --disable-network-policy --disable servicelb --disable local-storage` e instala Cilium `1.16.1`, sin aprovisionar LoadBalancer alternativo ni CSI de almacenamiento. Esto contradice el clúster operativo LXC 800 (`10.10.13.100`), que requiere Flannel y `local-path` para los PVCs de PostgreSQL/Redis/Backups. En paralelo, OpenTofu `environments/lab` crea VMs en `10.0.10.11-12` (`devops`, `proxmox_insecure = true`), mientras Ansible `inventories/lab/hosts.yaml` apunta a `10.10.14.10-11` (`root`).
- **Riesgo/impacto:** Un reprovisionamiento de DR sobre LXC 800 usando `setup_k3s.yaml` dejaría el clúster sin CNI funcional en LXC, con Traefik en `<pending>` y todos los PVCs en `Pending`; el entorno `lab` no puede converger entre OpenTofu y Ansible.
- **Recomendación:** Parametrizar `setup_k3s.yaml` con variables de rol/inventario (`cni_provider: flannel | cilium`, preservando `servicelb` y `local-storage` en perfil single-node LXC) y alinear subred, nombres de host, usuario SSH y verificación TLS entre `infra/opentofu/environments/lab` e `infra/ansible/inventories/lab`.
- **Verificación:** Añadir contrato de paridad IP/host entre `opentofu/environments/*` y `ansible/inventories/*` en `tests/security/iac_baseline_security.test.ts` e incluir `inventories/lab/hosts.yaml` en `validate-ansible` de `infra.yaml`.
- **Impacto en documentación:** `docs/architecture/ONPREM_SPOF_AND_FAILURE_DOMAIN_ANALYSIS.md (pendiente)`

### `AUD-CI-PUBDAG-001` Publicación OCI, firma Cosign y promoción GitOps en `main` sin esperar suites de pruebas, E2E ni Kind

- **Área:** CI/CD Pipeline & Gobernanza de Release (`repo-ci`, `repo-release`)
- **Prioridad:** `P1`
- **Confianza:** `HIGH`
- **Esfuerzo:** `M`
- **Evidencia:** [ci.yaml](../../../.github/workflows/ci.yaml#L503-L509) y [release-tag.yaml](../../../.github/workflows/release-tag.yaml#L386-L435)
- **Estado actual:** En `.github/workflows/ci.yaml:L507`, el job `publish` declara `needs: [code-quality, semgrep, build-docker, trivy-scan]`, omitiendo `sonarcloud` (donde corre toda la suite de tests unitarios, integración con PG/Valkey, seguridad y contratos) y desconectándose de los workflows hermanos `frontend-web` (Playwright/Lighthouse) e `infra` (Helm/Kubeconform/Checkov/Kind) orquestados en `change-impact.yaml`. A su vez, `release-tag.yaml` solo espera a verificar la firma Cosign de `${IMAGE_REF}:${GITHUB_SHA}` para abrir y auto-aprobar el PR `release/promote-vX.Y.Z`.
- **Riesgo/impacto:** Si un commit en `main` compila y pasa `biome`/`tsc`/`semgrep`/`trivy` pero rompe tests funcionales, migraciones o el despliegue en Kind, `publish` publica y firma igualmente las imágenes en GHCR y `release-tag.yaml` promueve esos digests defectuosos hacia GitOps.
- **Recomendación:** Incluir `sonarcloud` en `needs:` de `publish` de forma inmediata y mover/condicionar `publish` desde el orquestador `change-impact.yaml` (después de `🚦 Quality Gate`), haciendo que `release-tag.yaml` verifique también la conclusión `success` del workflow orquestador para `GITHUB_SHA`.
- **Verificación:** Añadir aserción en `tests/contracts/governance/ci_workflow_governance.test.ts` exigiendo que `publish` dependa del job ejecutor de `npm test` y de las compuertas de integración.
- **Impacto en documentación:** `docs/architecture/GITOPS_PROMOTION_WORKFLOW.md (pendiente)`

### `AUD-CI-IMPACT-001` Sub-clasificación de `.agents/**/*.ts` y reglas IaC en `.github/ci-impact.yaml` omite tests, tipado y SAST

- **Área:** Motor de Impacto CI (`repo-impact`, `repo-ci`)
- **Prioridad:** `P1`
- **Confianza:** `HIGH`
- **Esfuerzo:** `S`
- **Evidencia:** [ci-impact.yaml](../../../.github/ci-impact.yaml#L66-L115) (`L177-L217`)
- **Estado actual:** La regla `documentation` (`ci-impact.yaml:L104`) captura `.agents/**` activando exclusivamente `documentation: true` (`docs-gate`). Como `agent_governance` (`L69-L70`) solo lista `.agents/aas/**` y `.agents/skills/*/SKILL.md`, cualquier cambio en `.agents/skills/repo-tool-exec/scripts/tool-exec.ts`, `audit-freshness.ts`, `.agents/evals/*.test.ts` o `.agents/hooks.json` omite `code-quality` (`tsc`/Biome), `sonarcloud` (`npm test` / `npm run evals`) y `semgrep`. Del mismo modo, las reglas `helm` (`_helpers.tpl`), `opentofu` (`*.tf`) y `ansible` (`ansible.cfg`) no activan `tests: true`, saltando `tests/gitops/` y `tests/security/*_baseline_security.test.ts`.
- **Riesgo/impacto:** Permite fusionar PRs en verde con regresiones funcionales, errores de tipos o vulnerabilidades en scripts ejecutables de agentes y en infraestructura IaC/Helm sin ejecutar sus tests de seguridad asociados.
- **Recomendación:** Restringir `documentation` en `.agents/` a `**/*.md`, mover `.agents/**/*.ts`, `.agents/evals/**`, `.agents/hooks.json` y `tool-catalog.yaml` a `agent_governance` con `tests: true`, `linting: true` y `security.sast: true` (ejecutando además `npm run evals` en CI), y añadir `tests: true` a `helm`, `opentofu` y `ansible`.
- **Verificación:** Añadir casos unitarios en la suite de `detect-change-impact.ts` validando que `tool-exec.ts`, `eval_mcp_zero_trust.test.ts`, `_helpers.tpl` y `main.tf` disparen `tests: true`.
- **Impacto en documentación:** `.agents/skills/_shared/change-impact-matrix.md (pendiente)`

### `AUD-DEP-SCA-001` Cinco vulnerabilidades moderadas en `npm audit` y fallo continuo de `Dependabot Updates` en `main`

- **Área:** Dependencias y Supply Chain (`repo-dependencies`)
- **Prioridad:** `P1`
- **Confianza:** `HIGH`
- **Esfuerzo:** `S`
- **Evidencia:** [package.json](../../../package.json#L112-L131), `npm audit` local, Alerta Dependabot `#28` y GitHub Actions runs `41877959530` / `41875205123`
- **Estado actual:** `npm audit` reporta 5 vulnerabilidades `moderate`: `glob` `9.0.0 - 14.0.1` (`GHSA-3g3m-2fjr-6pw4`, vía `@sentry/node -> @sentry/bundler-plugins`) y `minimatch` `7.0.0 - 11.0.0` (`GHSA-g3hv-75wg-m249`, vía `markdownlint-cli@0.50.0` y `@lhci/cli@0.16.0 -> glob@13.0.6`). Al intentar remediar la alerta `#28`, el job dinámico `Dependabot Updates` falla en cada push a `main` con `security_update_not_possible` por conflicto de rangos entre `@lhci/cli@0.16.0` (`^10.2.2` y `^3.1.1`) y `markdownlint-cli@0.50.0` (`~10.2.6`).
- **Riesgo/impacto:** Presencia de dependencia transitiva vulnerable en el árbol de `@sentry/node` y bloqueo permanente de actualizaciones automáticas de seguridad de Dependabot sobre el ecosistema npm.
- **Recomendación:** Actualizar `@sentry/node` / `markdownlint-cli` si existen parches upstream o declarar `overrides` selectivos en `package.json` para `glob` (`>=14.0.2` en subárboles v9-v14) y `minimatch` (`>=11.0.1` en subárboles v10 / `>=3.1.5` en v3), verificando compatibilidad con `npm run lint:md` y `perf:lighthouse`.
- **Verificación:** `npm audit` con `0 vulnerabilities` y ejecución en verde de `Dependabot Updates` tras integrar el fix.
- **Impacto en documentación:** `Ninguno`

### `AUD-CFG-DOCKERIGN-001` Archivos `apps/*/.dockerignore` muertos por `context: .` y exclusiones ausentes en `.dockerignore` raíz

- **Área:** Configuration Hygiene (`repo-lifecycle`)
- **Prioridad:** `P1`
- **Confianza:** `HIGH`
- **Esfuerzo:** `XS`
- **Evidencia:** [apps/backend/.dockerignore](../../../apps/backend/.dockerignore#L1-L50), [apps/frontend/.dockerignore](../../../apps/frontend/.dockerignore#L1-L48), [.dockerignore](../../../.dockerignore#L1-L101), [ci.yaml](../../../.github/workflows/ci.yaml#L415-L416) y [check-ignore-hygiene.ts](../../../scripts/check-ignore-hygiene.ts#L98-L99)
- **Estado actual:** Todos los builds de contenedores (`ci.yaml`, `infra.yaml`, `docker-compose.yaml`, `taskfiles/dev.yaml`) invocan Docker con el contexto raíz `.` y `-f apps/<app>/Dockerfile`. Docker BuildKit únicamente lee `<context>/.dockerignore` (raíz) o `apps/<app>/Dockerfile.dockerignore`, ignorando por completo `apps/backend/.dockerignore` y `apps/frontend/.dockerignore`. Simultáneamente, `.dockerignore` raíz no excluye `backups/`, `*.sql*`, `*.enc`, `.agents/`, `.mcp/`, `.tools/`, `*_data/` ni las rutas actuales `apps/frontend/playwright.config.ts` y `apps/frontend/lighthouserc.json`.
- **Riesgo/impacto:** Falsa sensación de cobertura validada por `check-ignore-hygiene.ts`, inflado innecesario del contexto enviado al daemon de Docker y riesgo de empaquetar volcados locales o artefactos de agentes ante cambios futuros de `COPY`.
- **Recomendación:** Eliminar `apps/backend/.dockerignore` y `apps/frontend/.dockerignore` consolidando la política en `.dockerignore` raíz (añadiendo `backups/`, `*.sql*`, `*.enc`, `.agents/`, `.mcp/`, `.tools/`, `*_data/` y corrigiendo rutas movidas), y enseñar a `check-ignore-hygiene.ts` a rechazar `.dockerignore` huérfanos en subdirectorios sin contexto propio.
- **Verificación:** `npm run lint:ignore:strict` + build de ambas imágenes Docker (`apps/backend/Dockerfile` y `apps/frontend/Dockerfile`) verificando `COPY` exitoso.
- **Impacto en documentación:** `Ninguno`

### `AUD-DOC-DRIFT-001` Divergencias fácticas en Quickstart, documentación de arquitectura y `ADR Drift` en cuatro ADRs activos

- **Área:** Documentación y Gobernanza Arquitectónica (`repo-docs`, `adr-manager`)
- **Prioridad:** `P1`
- **Confianza:** `HIGH`
- **Esfuerzo:** `M`
- **Evidencia:** [README.md](../../../README.md#L125-L126), [docs/README.md](../../../docs/README.md#L150-L173), [KUBERNETES_NAMESPACE_TAXONOMY.md](../../../docs/architecture/KUBERNETES_NAMESPACE_TAXONOMY.md#L110-L143), [SECURITY_AND_NETWORK_ISOLATION.md](../../../docs/architecture/SECURITY_AND_NETWORK_ISOLATION.md#L55-L61), [ADR-003](../../decisions/ADR-003-gitops-with-argocd.md#L34), [ADR-006](../../decisions/ADR-006-disaster-recovery-strategy.md#L31-L61), [ADR-010](../../decisions/ADR-010-authentication-and-session-management.md#L21-L33) y [ADR-014](../../decisions/ADR-014-elastic-autoscaling-hpa-and-pod-disruption-budget.md#L24-L30)
- **Estado actual:**
  - `README.md:L125-L126` indica acceder a `http://localhost:3000/healthz` y `/metrics` tras `docker compose up -d`, pero `docker-compose.yaml:L36-L37` no publica el puerto `3000` al host (solo `8080` vía Nginx, o `3001` con `docker-compose.dev.yaml`).
  - `docs/README.md:L173` declara 23 ADRs omitiendo `ADR-031`; `ANALISIS_LENGUAJES_Y_MEJORES_PRACTICAS.md:L33-L34, L44` cita PostgreSQL 16, Redis 7 y contratos en `apps/backend/src/types.ts`; `MONOREPO_STRUCTURE.md:L251` omite `packages/contracts`; `KUBERNETES_NAMESPACE_TAXONOMY.md:L110, L139` usa el selector inexistente `app=pokedex-web` (el real es `app=pokemon-web`); `SECURITY_AND_NETWORK_ISOLATION.md:L55` afirma que PgBouncer escucha en `:5432` y atribuye el SBOM a `Syft` (`L204`, cuando CI usa Trivy).
  - Cuatro ADRs presentan `ADR Drift` directo: `ADR-003:L34` (dice que la API migra al arrancar en lugar de `migrate-job`), `ADR-006:L31, L61` (asume Cilium L7 y `pokedex/prod` para Rclone GDrive, que corre sobre Flannel y `pokedex/preprod`), `ADR-010:L21, L30, L33` (`Bearer <ADMIN_API_KEY>`, SHA-256 en `middleware/auth.ts` y prefijo `pokedex:revoked:`) y `ADR-014:L24-L30` (CPU `75%`, `web` minReplicas `2` y `behavior` ausente en plantillas HPA).
- **Riesgo/impacto:** Induce errores operativos directos en onboarding, debugging en K8s y auditorías futuras, erosionando el contrato de SSOT arquitectónico.
- **Recomendación:** Actualizar los documentos de `docs/architecture/` y `README.md` contra el código/Helm vigente, añadir notas de enmienda fechadas en `ADR-003`, `ADR-006`, `ADR-010` y `ADR-014` (o alinear `values.prod.yaml` / `*-hpa.yaml` con `ADR-014`), y ampliar `validate-docs-governance.ts` para verificar paridad de conteo de ADRs.
- **Verificación:** `npm run docs:validate` y `npm run lint:md` con 0 errores.
- **Impacto en documentación:** `README.md`, `docs/README.md`, `docs/architecture/*.md`, `docs/decisions/ADR-{003,006,010,014}*.md (pendiente)`

### `AUD-GOV-SKILLS-001` Desincronización de catálogo de skills, esquema falso en `db-drizzle-ops` y worktree no canónico activo

- **Área:** Gobernanza de Agentes y Worktrees (`.agents/`, `AGENTS.md`)
- **Prioridad:** `P1`
- **Confianza:** `HIGH`
- **Esfuerzo:** `S`
- **Evidencia:** [db-drizzle-ops/SKILL.md](../../../.agents/skills/db-drizzle-ops/SKILL.md#L18-L24), [schema.ts](../../../apps/backend/src/db/schema.ts#L10-L22), [.agents/README.md](../../../.agents/README.md#L48-L69), [change-impact-matrix.md](../../../.agents/skills/_shared/change-impact-matrix.md#L110-L123) y salida de `worktree:doctor`
- **Estado actual:** (1) `db-drizzle-ops/SKILL.md:L18-L19` instruye a los agentes que `pokedex_entries` tiene una columna relacional `fuerza` y un índice GIN sobre `data` (`CREATE INDEX IF NOT EXISTS ... USING gin (data)` sin `CONCURRENTLY`), ninguno de los cuales existe en `schema.ts`, e induce a escribir migraciones que violan `AGENTS.md` §3.3 (`check-migration-hygiene.ts`). (2) Las 4 skills `adr-manager`, `db-drizzle-ops`, `devsecops-preflight` y `k8s-gitops-validator` no figuran en `.agents/README.md` ni en `change-impact-matrix.md`. (3) El host mantiene registrado el worktree fuera de regla `.gemini/antigravity/worktrees/pokedex/repository_lifecycle_management` (`WT-NON-CANONICAL-LOCATION`).
- **Riesgo/impacto:** Instrucciones contradictorias para agentes autónomos que provocan fallos en el gate de migraciones y desvíos en el despacho condicional de skills y worktrees.
- **Recomendación:** Corregir `db-drizzle-ops/SKILL.md` (y referencias conexas en `AGENTS.md:L43` / `.mcp/registry.yaml:L222`) reflejando el esquema real y exigiendo `CONCURRENTLY`, incorporar las 4 skills en `.agents/README.md` y `change-impact-matrix.md`, y ejecutar `npm run worktree:cleanup -- --non-canonical` desde una sesión ubicada en la raíz principal.
- **Verificación:** `npm run worktree:doctor`, `npm run docs:validate` y `npm run lint:md`.
- **Impacto en documentación:** `.agents/README.md`, `.agents/skills/db-drizzle-ops/SKILL.md`, `.agents/skills/_shared/change-impact-matrix.md (pendiente)`

---

## 4. Cambios Propuestos y Roadmap de Corrección

1. **Inmediato — Seguridad, Supply Chain y Persistencia Crítica (`P1`):**
   - Remediar `AUD-DEP-SCA-001` en `package.json` (`minimatch` y `glob`) para restablecer `npm audit` en 0 y desbloquear `Dependabot Updates` en `main`.
   - Remediar `AUD-CI-PUBDAG-001` y `AUD-CI-IMPACT-001` asegurando que ningún artefacto se firme ni promueva sin superar `sonarcloud` (tests), E2E e `infra`, y que `.agents/**/*.ts` e IaC ejecuten sus suites de pruebas.
   - Remediar `AUD-SEC-URLVAL-001`, `AUD-SEC-RLREDIS-001`, `AUD-DB-SEEDPOOL-001` y `AUD-DB-FAILOPEN-001` cerrando los bypasses Anti-SSRF, garantizando fail-closed en Redis (`REDIS_URL || REDIS_HOST`) y PostgreSQL (`getDatabaseUrl()`), conectando `seed.ts` vía `DIRECT_DATABASE_URL` y bloqueando el cacheo en Redis de respuestas degradadas.
   - Remediar `AUD-INF-CILIUM-001`, `AUD-INF-CRONSEC-001` y `AUD-CFG-DOCKERIGN-001` en plantillas Helm y `.dockerignore`.
2. **Medio Plazo — Coherencia Multi-Entorno, IaC, Documentación y Cobertura (`P1`/`P2`):**
   - Alinear `setup_k3s.yaml`, OpenTofu `lab`/LXC 800 y Ansible `lab` (`AUD-IAC-ANSK3S-001`, `AUD-IAC-HARDEN-001`), y corregir `trust proxy` / subred Compose / ACL `/backoffice` (`AUD-INF-TRUSTPROXY-001`).
   - Endurecer logout/CSRF, cabeceras en `/metrics` + `ingress-nginx`, TLS de PostgreSQL y políticas Kyverno gestionadas por ArgoCD (`AUD-SEC-AUTHCSRF-001` a `AUD-CI-GATES-001`).
   - Sincronizar documentación, ADRs con drift, catálogo de skills y los 47 archivos `unknown` de `.github/ci-impact.yaml` (`AUD-DOC-DRIFT-001`, `AUD-GOV-SKILLS-001`, `AUD-CI-UNKNOWN-001`, `AUD-CFG-SECREVIEW-001`), y ampliar `coverage:gate` + E2E con Nginx (`AUD-TST-GAPS-001`).
3. **Mejoras Opcionales — Modularidad, Scripts y Higiene de Suite (`P3`):**
   - Mover `@pokedex/contracts` a `devDependencies`, alinear UID `10001` en `apps/backend/Dockerfile`, dividir hotspots (`pokedex.ts`, `pokemon.repository.ts`), consolidar `scripts/lib/linear.ts`, corregir `taskfiles/dev.yaml` y limpiar God Tests y sleeps fijos (`AUD-QUAL-HOTSPOTS-001` a `AUD-GOV-SKILLCTR-001`).

---

## 5. Configuration Hygiene

> **Vocabulario aplicado:** taxonomía estricta de 5 estados (`KEEP`, `KEEP_IMPROVE`, `REMOVE`, `REVIEW`, `SECURITY_REVIEW`) conforme a [`configuration-hygiene.md`](../../../.agents/skills/repo-lifecycle/references/configuration-hygiene.md) §5 y [`state-model.md`](../../../.agents/skills/_shared/state-model.md) §3.

### 1. `.ignore inventory`

Se descubrieron dinámicamente **8 archivos de exclusión dedicados** y **9 mecanismos de exclusión/allowlist acoplados**:

- **Archivos dedicados (`8`):** [`.gitignore`](../../../.gitignore) (93 reglas), [`.dockerignore`](../../../.dockerignore) (62 reglas), [`apps/backend/.dockerignore`](../../../apps/backend/.dockerignore) (32 reglas), [`apps/frontend/.dockerignore`](../../../apps/frontend/.dockerignore) (30 reglas), [`.markdownlintignore`](../../../.markdownlintignore) (13 reglas), [`.semgrepignore`](../../../.semgrepignore) (12 reglas), [`infra/helm/pokedex/.helmignore`](../../../infra/helm/pokedex/.helmignore) (25 reglas) y [`.git-blame-ignore-revs`](../../../.git-blame-ignore-revs) (1 revisión). *(Verificado que no existen `.gitleaksignore`, `.trivyignore`, `.npmignore` ni `.prettierignore`).*
- **Mecanismos equivalentes inline (`9`):** [`.gitleaks.toml`](../../../.gitleaks.toml) (`[allowlist]`), [`.github/zizmor.yaml`](../../../.github/zizmor.yaml) (`ignore`), [`.checkov.yaml`](../../../.checkov.yaml) (`skip-path`), [`.kube-linter.yaml`](../../../.kube-linter.yaml), [`biome.json`](../../../biome.json) (`files.includes`), [`sonar-project.properties`](../../../sonar-project.properties), [`.pre-commit-config.yaml`](../../../.pre-commit-config.yaml), [`tsconfig.json`](../../../tsconfig.json) y exclusiones hardcodeadas en `scripts/{lint-markdown,check-yaml-extension,check-ignore-hygiene}.ts`.

### 2. Obsolete rules

- **Archivos completos muertos:** `apps/backend/.dockerignore:L1-L50` y `apps/frontend/.dockerignore:L1-L48` nunca son leídos por Docker BuildKit porque todos los builds usan `context: .` (`ci.yaml:L415-L416`, `docker-compose.yaml:L9, L32`).
- **Rutas movidas que ya no coinciden:** `.dockerignore:L68-L69` (`playwright.config.ts`, `lighthouserc.json`) y `tsconfig.json:L17` (`playwright.config.ts`) apuntan a la raíz, pero residen en `apps/frontend/`.
- **Herramientas retiradas o ajenas al stack:** `.pytest_cache/` (`.dockerignore:L61`), `.nyc_output/` (`.gitignore:L22`, `.dockerignore:L58`), `dist-ssr/` (`.gitignore:L9`), `yarn-*`/`pnpm-*`/`lerna-*` (`.gitignore:L13-L16`, `.dockerignore:L18-L20`), `minio_data/` (`.gitignore:L89`), `.terraform*` (`.gitignore:L51, L64-L65`, `.markdownlintignore:L7-L8`, `.helmignore:L38`) y `.turbo` en `scripts/lint-markdown.ts:L80` / `scripts/check-yaml-extension.ts:L61`.
- **Reglas inoperantes en `.markdownlintignore`:** `**/.terraform/**` (`L8`, el comparador de prefijos `scripts/lint-markdown.ts:L90-L94` no soporta globs) y `.semgrepignore` / `LICENSE` (`L12-L13`, `lint-markdown.ts` solo evalúa `*.md`).

### 3. Missing rules

- **En `.dockerignore` raíz:** faltan `backups/`, `*.sql`, `*.sql.gz`, `*.enc`, `.agents/`, `.mcp/`, `.cursor/`, `.claude/`, `.tools/`, `*_data/` y `*.tfstate*`/`*.tfvars*` fuera de `infra/` (`infra/` en `L45` ya cubre los estados bajo `infra/opentofu/`).
- **En `.markdownlintignore` e `infra/helm/pokedex/.helmignore`:** falta `.tofu/` tras la migración desde Terraform.
- **En `biome.json:L10-L17` y `sonar-project.properties:L10`:** Biome omite `.agents/skills/**/scripts/**/*.ts`, `.agents/evals/**/*.ts` y `**/*.mjs`; SonarCloud omite `packages/contracts/src`.

### 4. Overbroad rules

- `secrets/` sin anclar a raíz en `.gitignore:L44` y `.dockerignore:L32` (podría ocultar código legítimo en subdirectorios `**/secrets/`).
- `reports/`, `*.tgz`, `*.tar.gz` y `*.log` en `.gitignore:L23, L80-L81, L138` vuelven redundantes reglas específicas (`L12`, `L55-L56`, `L78`); `postgres_data/` y `redis_data/` (`.gitignore:L87-L88`) quedan absorbidas por `*_data/` (`L86`); `.semgrepignore:L5-L6, L14-L15` duplica `dist/`+`**/dist/` y `tmp/`+`/tmp/`.

### 5. Security-sensitive exclusions

- **`.gitleaks.toml:L26-L32`:** mantiene 4 expresiones regulares en `[allowlist].paths` hacia rutas ya eliminadas en `HEAD` (`sealed-secrets.yaml`, `01-sealed-secrets.yaml`, `infra/ansible/inventory/hosts.ini`, `infra/k8s/secretstores/*.yaml`), con comentario desactualizado `(actual e histórico)` en `L26`. Si alguien recrea un archivo en esas rutas con credenciales reales, Gitleaks lo omitirá en silencio.
- **`.checkov.yaml:L4-L6`:** excluye `skip-path: ["infra/k8s/jobs"]` sin comentario ni justificación trazable, ocultando `egress-anti-ssrf-probe-job.yaml` (`imagePullPolicy: Always`, `curl -k`).
- **`.semgrepignore:L38` (`infra/`) y `.github/zizmor.yaml:L6-L23`:** ambos cuentan con justificación técnica explícita y controles compensatorios verificados en CI (`Checkov`, `Kube-Linter`, `Trivy IaC`, `Kyverno` y filtros `if:` en `pull_request_target` / `workflow_run`).

### 6. Cross-configuration consistency

- **Protección contractual de `Dockerfile`s:** las exclusiones propuestas para `.dockerignore` raíz (`backups/`, `*.sql*`, `*.enc`, `.agents/`, `.mcp/`, `apps/frontend/playwright.config.ts`, `apps/frontend/lighthouserc.json`) fueron contrastadas contra todos los `COPY` de `apps/backend/Dockerfile` y `apps/frontend/Dockerfile`, confirmando **cero riesgo de `COPY failed`**.
- **Consistencia con `.github/ci-impact.yaml`:** `.gitignore`, `.semgrepignore`, `.gitleaks.toml`, `.checkov.yaml`, `.kube-linter.yaml` y `.github/zizmor.yaml` no tienen regla propia y caen en `unknown` (fail-closed Full CI), donde además `unknown.triggers` (`ci-impact.yaml:L371-L389`) omite declarar `linting: true` en el resumen del motor.

### 7. Recommended changes

| Archivo | Regla / Bloque | Estado | Evidencia | Acción |
| :--- | :--- | :---: | :--- | :--- |
| `apps/backend/.dockerignore` | Archivo completo (`L1-L50`) | `REMOVE` | `ci.yaml:L415` y `docker-compose.yaml:L32` usan `context: .`; BuildKit lo ignora | Eliminar archivo y ajustar `check-ignore-hygiene.ts` |
| `apps/frontend/.dockerignore` | Archivo completo (`L1-L48`) | `REMOVE` | `ci.yaml:L416` y `docker-compose.yaml:L9` usan `context: .`; además falta `!.env.example` | Eliminar archivo y centralizar en `.dockerignore` raíz |
| `.dockerignore` | `backups/`, `*.sql*`, `*.enc`, `.agents/`, `.mcp/`, `.tools/`, `*_data/`, `*.tfstate*`, `*.tfvars*` | `SECURITY_REVIEW` | Ignorados en `.gitignore:L52-L63,L86,L90,L118-L124` pero ausentes en `.dockerignore` | Añadir al contexto de exclusión raíz tras auditar `COPY` |
| `.dockerignore` | `playwright.config.ts`, `lighthouserc.json` (`L68-L69`) | `KEEP_IMPROVE` | Archivos movidos a `apps/frontend/`; hoy entran en `COPY apps/frontend` | Actualizar a `apps/frontend/playwright.config.ts` y `apps/frontend/lighthouserc.json` |
| `.dockerignore` | `.nyc_output/`, `.pytest_cache/`, `yarn-*`, `pnpm-*` (`L18-L20,L58,L61`) | `REMOVE` | Sin consumidores reales en monorepo Node 24 + `npm@12.2.1` + `tsx` | Eliminar reglas obsoletas |
| `.gitignore` | `dist-ssr/`, `yarn/pnpm/lerna`, `.nyc_output/`, `.terraform*`, `minio_data/`, `postgres_data/`, `redis_data/` | `REMOVE` | Herramientas retiradas o absorbidas por `*_data/` (`L86`) | Purgar reglas muertas y redundantes |
| `.gitignore` | `secrets/` (`L44`), `reports/` (`L23`), `*.tgz` (`L78,L80`) | `KEEP_IMPROVE` | Patrones sin anclar y duplicados internos | Anclar `/secrets/` si aplica y consolidar duplicados |
| `.gitignore` | `.env*` + `!.env.example`, `*.pem`, `*.key`, MCP locales y `/tmp/` | `KEEP` | Coherente con `SECRETS_MANAGEMENT.md`, `mcp-governance.md` y `repository-hygiene.md` | Mantener sin cambios |
| `.markdownlintignore` | `apps/*/dist/`, `**/.terraform/**`, `.semgrepignore`, `LICENSE` (`L5-L6,L8,L12-L13`) | `REMOVE` | Inoperantes en `scripts/lint-markdown.ts:L90-L94,L102` o redundantes con `dist/` | Limpiar reglas inoperantes |
| `.markdownlintignore` & `.helmignore` | `.terraform/` (`.markdownlintignore:L7`, `.helmignore:L38`) | `KEEP_IMPROVE` | Migración completada a OpenTofu (`infra/opentofu/`) | Añadir/reemplazar por `.tofu/` |
| `.gitleaks.toml` | 4 rutas retiradas en `[allowlist].paths` (`L26-L32`) | `SECURITY_REVIEW` | Archivos inexistentes en `HEAD`; comentario `L26` inexacto | Documentar como históricas o acotar por commit tras validar con `gitleaks --log-opts` |
| `.checkov.yaml` | `skip-path: ["infra/k8s/jobs"]` (`L4-L6`) | `SECURITY_REVIEW` | Excluye `egress-anti-ssrf-probe-job.yaml` sin justificación escrita | Endurecer el Job y retirar `skip-path`, o documentar excepción formal |
| `.semgrepignore` | `infra/` (`L17-L38`) y pares `dist/`/`tmp/` (`L5-L6,L14-L15`) | `KEEP_IMPROVE` | `infra/` justificado con controles compensatorios; pares `dist`/`tmp` redundantes | Mantener `infra/` y simplificar duplicados |
| `.github/zizmor.yaml` | Excepciones `dangerous-triggers` y `artipacked` (`L6-L23`) | `KEEP` | Cada workflow listado incluye justificación técnica verificable | Mantener sin cambios |
| `.kube-linter.yaml` | `doNotAutoAddDefaults: true` + 8 checks (`L6-L15`) | `REVIEW` | No detectó la ausencia de `seccompProfile` en los 3 CronJobs | Evaluar incorporar check de seccomp/probes en Kube-Linter |

---

## 6. Checklist de Verificación y Criterios de Aceptación (Post-Remediación)

- [ ] **Dependencias & SCA (`AUD-DEP-SCA-001`):** `npm audit` retorna `0 vulnerabilities` y `Dependabot Updates` finaliza en `success` en `main`.
- [ ] **Tests Unitarios, Integración y Evals:** `npm ci && npm test && npm run evals` exitosos (`0` fallos), incluyendo nuevos tests de regresión para `AUD-SEC-URLVAL-001`, `AUD-SEC-RLREDIS-001`, `AUD-DB-SEEDPOOL-001` y `AUD-DB-FAILOPEN-001`.
- [ ] **Compilación & Tipado:** `npm run build`, `npm run lint` y `npm run typecheck` limpios.
- [ ] **Infraestructura, Admisión y Paridad GitOps:** `helm template` en `dev`, `proxmox-preprod` y `cloud` validado contra `kubeconform`, `kube-linter` y `kyverno apply` (`0` violaciones `seccompProfile`, paridad entre `network-policies.yaml` y `cilium-network-policies.yaml`).
- [ ] **Pipelines de CI/CD & Motor de Impacto:** `publish` bloqueado hasta superar suites de pruebas/E2E/Kind, y `detect-change-impact.ts` clasificando `.agents/**/*.ts`, `packages/contracts/**` e IaC con sus gates correspondientes.
- [ ] **Documentación, Skills & Worktrees:** `npm run docs:validate`, `npm run lint:md`, `npm run lint:ignore:strict` y `npm run worktree:doctor` en verde (`0` errores `MDxxx` y `0` worktrees fuera de la base canónica).
