# Auditoría Integral (`full-audit`) — Baseline 2026-10-27

> **Estado:** Histórico (snapshot inmutable; su frescura se evalúa con `audit-freshness.ts`)
>
> **Fecha de captura:** 2026-10-27
>
> **Commit:** `989a6b9503fd494a198e3cececced138b3f7037e` (base en `main`: `e83069802cb38ac7b86ed82065acd682202dff05`, release `v1.119.8`, más los commits de remediación `4827abc8`, `fca94526` y `989a6b95`)
>
> **Rama auditada:** `main` (release `v1.119.8`)
>
> [!IMPORTANT]
> Este documento es evidencia histórica del commit auditado. No es SSOT: el estado vigente
> reside en `apps/`, `infra/`, `gitops/`, `scripts/`, `tests/` y `docs/architecture/`.
> El estado de cada hallazgo se sigue fuera del snapshot (issue con título `AUD-*`).

**Repositorio:** `rocapellino/pokedex`
**Contexto Operativo:** Monorepo (`apps/backend`, `apps/frontend`, `packages/contracts`) | Entornos: Kind / Proxmox Pre-prod / Prod Cloud (blueprint)
**Vocabulario de estados:** gates según [state-model.md](../../../.agents/skills/_shared/state-model.md) §3 (`PASS`, `FAIL`, `NOT_EXECUTED`, `CI_REQUIRED`).
**Foco de la sesión:** reemplazar el baseline `2026-10-22` (commit `a149c555`) absorbiendo los 38 commits integrados entre `v1.119.1` (`#924`) y `v1.119.8` (`#967`) —incluyendo la restauración de IP real en Nginx y limpieza de reglas `.ignore` (`#937`), la deduplicación de reglas de Renovate y actualización de herramientas IaC/Supply Chain (`#939`), la mitigación de vulnerabilidades de octubre de 2026 en Node.js (`24.22.1`) y `body-parser` (`#944`), y las actualizaciones de dependencias, acciones de CI, imágenes base y proveedor OpenTofu Proxmox (`~> 0.118.0`)— junto con la remediación inmediata con tests de regresión de `AUD-INF-NGINX-002`, `AUD-REL-RET-002` y `AUD-TOOL-CAT-001`. Mantiene un único snapshot activo conforme a `max_active_snapshots: 1`.

---

## 1. Identificación y Paridad de Versión

| Componente | Valor auditado | Fuente |
| :--- | :--- | :--- |
| `package.json` | `1.119.8` | Versión de aplicación y monorepo |
| `infra/helm/pokedex/Chart.yaml` (`version` / `appVersion`) | `1.119.8` | Empaquetado Helm |
| GitOps `targetRevision` (manifiestos de `gitops/apps/`) | `v1.119.8` | Promoción ArgoCD |
| Último tag y release publicado | `v1.119.8` | `git ls-remote --tags origin`, `gh release list` |
| Tags remotos (11) | `v1.117.0`, `v1.118.0`, `v1.119.0` .. `v1.119.8` | `git ls-remote --tags origin` |
| Releases (publicados / borradores) | 11 / 0 | `gh api repos/rocapellino/pokedex/releases` |

La aplicación raíz de ArgoCD (`root-application.yaml`) mantiene `targetRevision: main`, por lo que `audit-freshness.ts` informa `GITOPS_REVISION` de manera informativa y no bloqueante aunque `app-proxmox-preprod.yaml` y `app-cloud.yaml` estén alineados en `v1.119.8`.

---

## 2. Resumen Ejecutivo

El repositorio mantiene paridad criptográfica 1:1 de versión (`1.119.8` / `v1.119.8`) y de digests SHA256 entre Cloud GitOps (blueprint), Proxmox Pre-prod y Helm Production, gobernanza documental sin drift y el 100% de las suites de pruebas en verde (`1290` pasados, `0` fallos, `1` omitido justificado).

Durante la auditoría se verificó el cierre de los 4 hallazgos remediados entre `v1.119.1` y `v1.119.8` (`#937`, `#939`, `#944`) y se detectaron 4 hallazgos adicionales mediante trazado de rutas por entorno (`/repo-architecture route-trace`), contraste de ejecuciones reales de retención en CI y escaneo de dependencias de desarrollo: tres de ellos (`AUD-INF-NGINX-002`, `AUD-REL-RET-002` y `AUD-TOOL-CAT-001`) fueron remediados en el mismo ciclo con tests de regresión previos (`repo-fix`), quedando únicamente 1 hallazgo `P3` en seguimiento (`AUD-DEP-ZOD-002`, acotado a `devDependencies` sin impacto en producción).

- **Total de Hallazgos Abiertos:** 1 (`P3` en `devDependencies`, bloqueado por dependencia transitiva upstream)
- **P0 (Crítico):** 0
- **P1 (Alto):** 0
- **P2 (Medio):** 0 abiertos (3 cerrados/verificados en este ciclo: `AUD-SEC-NODE-001`, `AUD-INF-NGINX-002`, `AUD-REL-RET-002`)
- **P3 (Bajo):** 1 abierto (`AUD-DEP-ZOD-002`); 4 cerrados/verificados en este ciclo (`AUD-INF-NGINX-001`, `AUD-CFG-IGNORE-001`, `AUD-OCI-LABEL-001`, `AUD-TOOL-CAT-001`)

### Gates Automáticos

| Gate | Estado | Evidencia |
| :--- | :--- | :--- |
| `npm run typecheck` | `PASS` | TypeScript (`~7.0.2`) compila sin errores en raíz, workspaces y `@pokedex/contracts` |
| `npm run lint` | `PASS` | Biome (`2.6.3`) verifica 330 archivos con 0 errores y 0 advertencias |
| `npm run build` | `PASS` | `esbuild` (`server.cjs` 162.9 kB, `seed.cjs` 1.1 MB, `migrate.cjs` 7.7 kB) y `vite build` (39 módulos) en verde |
| `npm run docs:validate` | `PASS` | 100% de los documentos cumplen las compuertas de gobernanza sin drift |
| `npm run lint:md` | `PASS` | 155 archivos Markdown validados con 0 errores `MDxxx` |
| `npm run lint:ignore:strict` | `PASS` | 7 archivos `.ignore` validados en modo estricto tras la limpieza de `#937` |
| `npm run lint:yaml:strict` | `PASS` | 0 archivos `.yml` (política canónica `.yaml` cumplida al 100%) |
| `npm run test:surface:check` | `PASS` | Catálogo sincronizado sin drift (168 archivos activos, 1274 casos catalogados tras las remediaciones) |
| `npm run nginx:conf:check` | `PASS` | `apps/frontend/nginx.conf` sincronizado con `apps/frontend/nginx.conf.template` (`APPS-001`) |
| `npm run gitops:verify-parity:strict` | `PASS` | Paridad 1:1 de digests SHA256 (`api: sha256:4dadeb1a...`, `web: sha256:48c4b2f3...`) mediante Helm Template real |
| `npm run gitops:pin:check` | `PASS` | Coherencia de `targetRevision: v1.119.8` en `app-cloud.yaml` y `app-proxmox-preprod.yaml` |
| `npm run secrets:audit-rotation` | `PASS` | 12/12 controles de la arquitectura dual (Reloader Cloud / Rollout Proxmox) |
| `npm run db:lint-migrations` | `PASS` | 1 archivo de migración evaluado; protocolo Expand-Contract e índices concurrentes 100% conformes |
| `npm run governance:audit-scripts` | `PASS` | 28/28 tests de gobernanza y seguridad de scripts, Ansible y OpenTofu |
| `npm run mcp:validate` / `mcp:scan` / `mcp:test` | `PASS` | 9 servidores (8 habilitados), 8 perfiles y 5 clientes; 0 hallazgos en `mcp-scan`; 48/48 tests |
| `npm run worktree:doctor` | `PASS` | Auditoría completa (351 archivos inspeccionados); 0 worktrees fuera de regla ni prunables |
| `npm run aas:governance` | `PASS` | AAS Core 18.6.0: gobierno local válido (8 referencias, sin materialización) |
| `npm run evals` | `PASS` | 10/10 evaluaciones contractuales (contratos sin Zod, referencias, Helm SecurityContext y MCP) |
| `npm audit --omit=dev --package-lock-only` | `PASS` | 0 vulnerabilidades en dependencias de producción (`@pokedex/backend` usa `zod@4.6.7` y `body-parser@2.4.0`) |
| `npm audit --package-lock-only` | `FAIL` | 6 entradas `high` en `devDependencies` por un único aviso (`GHSA-mrhx-c7xc-m3w5` en `zod@3.25.76` vía `@lhci/cli`); ver `AUD-DEP-ZOD-002` |
| `npm run test:unit` | `PASS` | 243/243 tests superados (0 fallos) |
| `npm run test:contracts` | `PASS` | 358/359 tests superados (0 fallos, 1 omitido justificado en entorno live de GitHub) |
| `npm run test:security` | `PASS` | 214/214 tests superados (0 fallos, incluyendo suites con render Helm) |
| `npm run test:gitops` | `PASS` | 45/45 tests superados (0 fallos, incluyendo suites con render Helm) |
| `npm run test:frontend` | `PASS` | 375/375 tests superados (0 fallos) |
| `npm run test:integration` | `PASS` | 48/48 tests superados (0 fallos) |
| `npm run test:fuzz` | `PASS` | 7/7 tests superados (0 fallos) |
| `npm run probe:security:egress` | `PASS` | 6/6 destinos validados (Anti-SSRF IMDS/RFC1918 y allowlist FQDN Cilium L7) |
| Retención de tags (`tag-retention.yaml`, CI `40397745711`) | `PASS` | Ejecución `dry-run` sobre 11 tags remotos; ventana de rollback $N, N-1, N-2$ blindada tras `AUD-REL-RET-002` |
| Retención de GHCR (`ghcr-retention.yaml`, CI `40398264676`) | `PASS` | Paginación completa (`pokedex`: 3, `pokedex-api`: 2529, `pokedex-web`: 2538 versiones), 3 releases protegidos (`v1.119.8`, `v1.119.7`, `v1.119.6`, 6 digests), 2 imágenes obsoletas purgadas |

---

## 3. Matriz de Hallazgos y Remediaciones Consolidadas

| ID | Área | Evidencia (`ruta:línea`) | Riesgo / Impacto | Prioridad | Confianza | Esfuerzo | Estado | Acción / Remediación |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `AUD-INF-NGINX-002` | Infraestructura / GitOps / Nginx | `apps/frontend/nginx.conf.template:13-17,72-77,135-156`, `gitops/environments/proxmox-preprod/values.yaml:61-66`, `infra/ansible/inventories/proxmox/hosts.yaml:9,48` | Tras habilitar `set_real_ip_from 10.42.0.0/16` y `real_ip_header X-Forwarded-For` en `#937`, Nginx resuelve la IP real del cliente detrás de Traefik. `gitops/environments/proxmox-preprod/values.yaml` no sobrescribía `web.env.backofficeAllowedIp1/2` y heredaba `10.42.0.1/32` y `192.168.1.50/32`, bloqueando con `403 Forbidden` el acceso a `/backoffice` desde el Bastion (`10.10.13.120`) o la red de gestión (`10.10.13.0/24`). Además, `location /pokemons` omitía `proxy_set_header X-Forwarded-Proto $scheme;`. | `P2` | `HIGH` | `XS` | `VERIFIED` | Remediado en `4827abc8`: `web.env.backofficeAllowedIp1: "10.10.13.120/32"` y `backofficeAllowedIp2: "10.10.13.0/24"` en `proxmox-preprod/values.yaml`, `proxy_set_header X-Forwarded-Proto $scheme;` en `location /pokemons` y tests de regresión en `environment_http_contract.test.ts` y `nginx_effective_headers.test.ts`. |
| `AUD-REL-RET-002` | Supply Chain / Retención Tags y GHCR | `scripts/ghcr-retention.ts:140-165`, `scripts/tag-retention.ts:260-367,1277-1286`, `.github/workflows/tag-retention.yaml:60,112`, runs CI `40397745711` y `40398264676` | `ghcr-retention.ts` protege las imágenes de los últimos 3 tags SemVer globales (`v1.119.8`, `v1.119.7`, `v1.119.6`) y purgó de GHCR las de `v1.119.0`..`v1.119.5`. En cambio, `tag-retention.ts` (`patch_count=1`) solo retenía 1 patch por minor (`v1.119.8`, `v1.118.0`, `v1.117.0`) y marcaba `v1.119.0`..`v1.119.7` para purga, lo que al ejecutarse en modo destructivo habría eliminado los tags `v1.119.7` y `v1.119.6` y dejado sin protección sus imágenes de rollback en GHCR. | `P2` | `HIGH` | `S` | `VERIFIED` | Remediado en `fca94526`: `protectRollbackWindowTags` en `scripts/tag-retention.ts` protege los últimos 3 releases SemVer estables ($N, N-1, N-2$), `fetch-tags: true` en `.github/workflows/tag-retention.yaml`, documentación en `TAG_RETENTION_POLICY.md` y test contractual cruzado en `tag_retention.test.ts`. |
| `AUD-TOOL-CAT-001` | Tooling / Catálogo de Contenedores | `.agents/skills/repo-tool-exec/references/tool-catalog.yaml:62,138,150,162` vs `.github/workflows/infra.yaml:116,130,146` y `.github/workflows/security-gitleaks.yaml:51` | El catálogo de fallback de `repo-tool-exec` conservaba versiones rezagadas respecto a los workflows de CI en `kubeconform` (`v0.6.7` vs `v0.8.0`), `kube-linter` (`v0.7.2` vs `v0.8.3`), `kyverno` (`v1.12.5` vs `v1.19.2`) y `gitleaks` (`v8.24.2` vs `v8.30.1`). | `P3` | `HIGH` | `XS` | `VERIFIED` | Remediado en `989a6b95`: versiones sincronizadas en `tool-catalog.yaml` y test de paridad añadido en `tests/contracts/adr/adr_ci_tooling_contracts.test.ts`. |
| `AUD-DEP-ZOD-002` | Dependencias / SCA Dev | `package-lock.json` (`@lhci/cli@0.15.1 -> lighthouse@12.6.1 -> puppeteer-core@24.43.1 -> chromium-bidi@14.0.0 -> zod@3.25.76`) | `GHSA-mrhx-c7xc-m3w5` (severidad alta): agotamiento de memoria en `zod <4.6.6` al validar colecciones restringidas sobredimensionadas. Afecta únicamente a `devDependencies` (CLI de Lighthouse); el runtime de producción (`@pokedex/backend`) usa `zod@4.6.7` y `npm audit --omit=dev` reporta 0 vulnerabilidades. No admite `overrides` directo a `^4.6.7` porque `chromium-bidi` consume la API de Zod v3 y no existe parche en la línea 3.x. | `P3` | `HIGH` | `XS` | `OPEN` | Mantener seguimiento hasta que `chromium-bidi` / `lighthouse` / `@lhci/cli` actualicen a Zod v4 o se publique parche en `zod` 3.x; no ejecutar `npm audit fix --force` (degradaría `@lhci/cli` a `0.13.0`). |
| `AUD-SEC-NODE-001` | Runtime / Dependencias | `.tool-versions:1`, `package-lock.json` (`body-parser 2.4.0`, `undici 8.12.3`, `fast-uri 3.1.9`) | Publicación de vulnerabilidades de octubre de 2026 en Node.js 24 (`CVE-2026-111497` Brotli OOB write y CVEs de TLS/DNS) y DoS con cuerpos comprimidos en `body-parser`. | `P2` | `HIGH` | `XS` | `CLOSED` | Mitigado en PR `#944`: actualización de `.tool-versions` a `nodejs 24.22.1` y de `package-lock.json` a `body-parser 2.4.0` (prod) y `body-parser 1.20.9`, `undici 8.12.3` y `fast-uri 3.1.9` (dev). |
| `AUD-INF-NGINX-001` | Infraestructura / Seguridad HTTP | `apps/frontend/nginx.conf.template:13-17`, `infra/helm/pokedex/templates/configmap.yaml:22-24`, `infra/helm/pokedex/templates/web-deployment.yaml:64-66` | Nginx detrás de Ingress evaluaba la allowlist de `/backoffice` contra la IP del pod de Ingress (`10.42.x.x`) sin restaurar `X-Forwarded-For`, y el chart de Helm no inyectaba `BACKOFFICE_ALLOWED_IP_*` en el contenedor `web`. | `P3` | `HIGH` | `S` | `CLOSED` | Remediado en PR `#937` con `set_real_ip_from` / `real_ip_header X-Forwarded-For`, parametrización en `pokemon-config` y montaje `envFrom` en `web-deployment.yaml`, más tests en `nginx_effective_headers.test.ts` y `gitops_adr_contracts.test.ts`. |
| `AUD-CFG-IGNORE-001` | Higiene de Configuración | `.dockerignore`, `.gitignore`, `.semgrepignore` | Reglas residuales de Python (`__pycache__`, `*.py[cod]`, `.venv`) en un monorepo exclusivamente TypeScript/Node.js. | `P3` | `HIGH` | `XS` | `CLOSED` | Remediado en PR `#937`: reglas heredadas eliminadas y comentario de `.semgrepignore` actualizado. |
| `AUD-OCI-LABEL-001` | Supply Chain / Metadatos OCI | `apps/frontend/Dockerfile:27,34` | Etiqueta `maintainer` desalineada en `apps/frontend/Dockerfile` respecto a `apps/backend/Dockerfile`. | `P3` | `HIGH` | `XS` | `CLOSED` | Remediado en PR `#937` y sincronizado con `docs/best-practices/MEJORES_PRACTICAS_DOCKERFILE.md`. |

Hallazgos cerrados consolidados de baselines anteriores (consultables en el historial de Git con `git log --stat -- docs/audits/`): `AUD-DEP-DOMP-001` (`#923`), `AUD-DEP-IPADDR-001` (`#923`), `AUD-CI-PIPE-001` (`#921`), `AUD-REL-GHCR-003` (`#919`), `AUD-REL-GHCR-002` (`#918`), `AUD-REL-GHCR-001` (`#915`, `#917`), `AUD-REL-DRAFT-001` (`#916`), `AUD-REL-RET-001` (`#907`), `AUD-MCP-TRACE-001` (`#906`), `AUD-DEP-MDIT-001` (`#903`), `AUD-DB-CONN-001` (`#894`), `AUD-DB-PREP-001` (`#901`), `AUD-TOOL-BIOME-001` (`#896`), `AUD-GOV-EVAL-001` (`#898`), `AUD-MCP-SCAN-001` (`#899`) y `AUD-MCP-HITL-001` (`#900`).

---

## 4. Detalle de Hallazgos Significativos (P0 / P1)

No se registraron hallazgos `P0` ni `P1` en este ciclo, y los hallazgos `P2` detectados (`AUD-INF-NGINX-002` y `AUD-REL-RET-002`) quedaron verificados con tests de regresión en la misma sesión.

---

## 5. Configuration Hygiene

### 1. `.ignore inventory`

Catálogo inspeccionado mediante `scripts/check-ignore-hygiene.ts --strict` (7 archivos):

1. `.dockerignore` (raíz — 62 reglas activas, 102 líneas).
2. `.gitignore` (raíz — 93 reglas activas, 155 líneas).
3. `.markdownlintignore` (raíz — 13 reglas activas, 14 líneas).
4. `.semgrepignore` (raíz — 12 reglas activas, 39 líneas).
5. `apps/backend/.dockerignore` (32 reglas activas, 50 líneas).
6. `apps/frontend/.dockerignore` (30 reglas activas, 48 líneas).
7. `infra/helm/pokedex/.helmignore` (25 reglas activas, 43 líneas).

### 2. Obsolete / Missing / Overbroad rules

Ninguna regla obsoleta, faltante ni desmedida detectada tras la eliminación de las reglas residuales de Python en `#937` (`AUD-CFG-IGNORE-001`). Los patrones de artefactos transitorios (`tmp/`, `dist/`, `node_modules/`, `.worktrees/`, `.mcp/*.local.json`) están presentes de forma homogénea.

### 3. Security-sensitive exclusions

- `.env` y variantes excluidas en `.gitignore` y en los `.dockerignore` de raíz y de cada workspace.
- Certificados y llaves privadas (`*.pem`, `*.key`) excluidos en `.gitignore`.
- `/tmp/` aislado conforme a `repository-hygiene.md`.
- Configuraciones locales de clientes MCP protegidas en `.gitignore`.

### 4. Cross-configuration consistency

Los contextos de build en `apps/backend/Dockerfile` y `apps/frontend/Dockerfile`, las exclusiones de `infra/ansible/deploy_excludes.txt` y los filtros de `.github/ci-impact.yaml` son consistentes entre sí.

### 5. Recommended changes

| Archivo | Regla / Patrón | Clasificación | Justificación |
| :--- | :--- | :--- | :--- |
| `.gitignore` | Reglas actuales (93) | `KEEP` | Cubre artefactos, secretos, worktrees y entornos locales tras `#937`. |
| `.dockerignore` | Reglas raíz (62) y apps (32 / 30) | `KEEP` | Minimiza el contexto de build y previene filtración de secretos. |
| `.markdownlintignore` | Reglas de documentación (13) | `KEEP` | Alineado con el presupuesto documental y templates. |
| `.semgrepignore` | Reglas de SAST (12) | `KEEP` | Excluye fixtures de tests y código generado. |
| `infra/helm/pokedex/.helmignore` | Reglas de chart (25) | `KEEP` | Evita empaquetar values locales o documentación en el chart OCI. |

---

## 6. Depuración del Repositorio

Diagnóstico de solo lectura conforme a [cleanup-protocol.md](../../../.agents/skills/_shared/cleanup-protocol.md):

| Control | Resultado |
| :--- | :--- |
| Scripts `.sh` (ADR-020) | Solo `scripts/dr_verify_restore.sh`, la excepción autorizada. |
| Archivos `.yml` | 0. |
| Residuos versionados (`.bak`, `.tmp`, `.orig`, `.rej`, `.swp`) | 0. |
| Contenido versionado bajo `tmp/` | 0. |
| Ramas remotas | `origin/main` y `origin/renovate/renovate-renovate-44.x` (0 PRs abiertos; rama residual de Renovate tras `#966`). |
| Worktrees (`worktree:doctor`) | Checkout principal y worktree gobernado de la sesión bajo `../.worktrees/pokedex/`, 0 fuera de regla, 0 prunables. |
| Tags locales / remotos | 11 tags sincronizados (`v1.117.0`, `v1.118.0`, `v1.119.0` .. `v1.119.8`). |
| Releases (publicados / borradores) | 11 publicados / 0 borradores. |

Candidatos pendientes de aprobación humana (fase 5 del protocolo; no se ejecutan durante la auditoría):

| Candidato | Estado | Justificación |
| :--- | :--- | :--- |
| Rama remota `origin/renovate/renovate-renovate-44.x` | `REVIEW` | Rama sin PR abierto tras la fusión de `#966`; Renovate la recicla o limpia en su siguiente ejecución programada. |
| 6 tags patch históricos (`v1.119.0` .. `v1.119.5`) | `REVIEW` | Elegibles para purga manual autorizada en `tag-retention.yaml` (`dry_run: false`) una vez fusionado `AUD-REL-RET-002`, que protege `v1.119.8`, `v1.119.7` y `v1.119.6`. |

---

## 7. Cambios Propuestos y Roadmap

1. **Inmediato (P0/P1):** Ninguno requerido.
2. **Medio Plazo (P2):** Ninguno abierto (`AUD-INF-NGINX-002` y `AUD-REL-RET-002` remediados y verificados con tests de regresión en este ciclo).
3. **Mantenimiento Continuo (P3):**
   - Vigilar la actualización upstream de `@lhci/cli` / `chromium-bidi` para cerrar el aviso de desarrollo `GHSA-mrhx-c7xc-m3w5` en `zod@3.25.76` (`AUD-DEP-ZOD-002`).

---

## 8. Checklist de Verificación y Criterios de Aceptación

- [x] **Compilación & Tipado:** `npm run typecheck` y `npm run build` en verde.
- [x] **Linters de Código:** `npm run lint` (Biome `2.6.3`) limpio en 330 archivos.
- [x] **Gobernanza Documental & Markdown Gate:** `npm run docs:validate` y `npm run lint:md` sin fallos (155 archivos Markdown).
- [x] **Higiene de Configuración:** `npm run lint:ignore:strict` y `npm run lint:yaml:strict` en verde.
- [x] **Superficie de Testing & Suites Completas:** `npm run test:surface:check` sincronizado (1274 casos catalogados) y 1290/1291 tests ejecutados en verde en las 7 suites (`unit`, `contracts`, `security`, `gitops`, `frontend`, `integration`, `fuzz`).
- [x] **Gobernanza de Secretos & Migraciones DB:** `npm run secrets:audit-rotation` (12/12 controles) y `npm run db:lint-migrations` en verde.
- [x] **Supply Chain & GitOps:** `npm run gitops:verify-parity:strict` y `npm run gitops:pin:check` certificados en `v1.119.8`.
- [x] **Dependencias de Producción:** `npm audit --omit=dev --package-lock-only` en 0 vulnerabilidades (`AUD-DEP-ZOD-002` acotado a `devDependencies`).
- [x] **Anti-SSRF & Egress:** `npm run probe:security:egress` verificado en modo determinista.
- [x] **Gobernanza de Worktrees, AAS, Evals & MCP:** `npm run worktree:doctor`, `npm run aas:governance`, `npm run evals`, `npm run mcp:validate`, `npm run mcp:scan` y `npm run mcp:test` validados.
- [x] **Retención de Auditorías:** Un único baseline activo conforme a `max_active_snapshots: 1`.
