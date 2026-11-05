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
| GitOps `targetRevision` (manifiestos de `gitops/apps/`) | `v1.119.16` | Promoción ArgoCD |
| Último tag y release publicado | `v1.119.16` | `git ls-remote --tags origin`, `gh release list` |

---

## 2. Resumen Ejecutivo

- **Total de Hallazgos:** 31
- **P0 (Crítico):** 0
- **P1 (Alto):** 14
- **P2 (Medio):** 12
- **P3 (Bajo):** 5

### Estado de los Cuatro Niveles SDLC & GitOps

1. **`MAIN` (Estado Candidato):** `DEGRADED`. Código fuente y linters en verde, pero `Dependabot Updates` falla por incompatibilidad de rangos en `minimatch`/`glob` (`GHSA-g3hv-75wg-m249`) y existen defectos entre capas y bypasses de seguridad en red/persistencia.
2. **`RELEASE` (Estado Promocionable):** `PARTIAL_PASS`. Tag `v1.119.16` firmado criptográficamente con Sigstore Gitsign, OCI digests verificados e inmutables en GHCR; firma Cosign y atestaciones SLSA/SBOM generadas en CI pero con DAG de publicación que no espera a la totalidad de suites de pruebas.
3. **`GITOPS` (Estado Declarado):** `ALIGNED_PREPROD` / `BROKEN_BLUEPRINT`. Entorno operativo `proxmox-preprod` alineado en `v1.119.16` (Traefik + Flannel + Vault ESO `pokedex/preprod`); blueprint `cloud` inactivo con políticas Cilium y métricas rotas ante renderizado estricto.
4. **`RUNTIME` (Estado Observado):** `UNKNOWN`. Sin telemetría directa hacia el clúster durante la auditoría.

---

## 3. Matriz Consolidada de Hallazgos

| ID | Área | Prioridad | Confianza | Esfuerzo | Resumen del Hallazgo |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `AUD-SEC-URLVAL-001` | Seguridad App | `P1` | `HIGH` | `S` | Bypasses en `validateImageUrl` en prod para `https://localhost`, `[::ffff:169.254.169.254]` (hex WHATWG), NAT64 y `localhost.` |
| `AUD-SEC-RLREDIS-001` | Seguridad / ADR-027 | `P1` | `HIGH` | `S` | Rate limiting de auth y CRUD degrada fail-open ante caída de Redis; split-brain `REDIS_HOST` vs `REDIS_URL` desactiva fail-closed |
| `AUD-DB-SEEDPOOL-001` | Persistencia / ADR-011 | `P1` | `HIGH` | `S` | `seed.ts` y `seed-job` ignoran `DIRECT_DATABASE_URL` (van a `:6432`) y salen con `exit(0)` sobre `memoryMap` si PG falla |
| `AUD-DB-FAILOPEN-001` | Persistencia / ADR-027 | `P1` | `HIGH` | `M` | `isPgConfigured()` ignora `POSTGRES_*` habilitando escrituras CRUD volátiles; fallos SQL en prod envenenan Redis con datos truncados |
| `AUD-INF-CILIUM-001` | Red Zero-Trust | `P1` | `HIGH` | `S` | `CiliumNetworkPolicy` bloquea Ingress directo hacia `pokemon-api` (`/api/`, `/pokemons`) y scraping de `/metrics` en blueprint cloud |
| `AUD-INF-CRONSEC-001` | K8s / DR / Kyverno | `P1` | `HIGH` | `XS` | 3 CronJobs omiten `seccompProfile` (rechazados por PSA restricted / Kyverno Enforce) y `dr-restore-verify` referencia `pokedex-secrets` |
| `AUD-INF-TRUSTPROXY-001` | Bordes HTTP / Proxy | `P1` | `HIGH` | `M` | Spoofing `X-Forwarded-For` en Compose, `403` en `/backoffice` vía Nginx en Compose/Kind y ausencia de ACL IP en `/api/v1/auth/*` |
| `AUD-IAC-ANSK3S-001` | IaC Ansible & Tofu | `P1` | `HIGH` | `M` | `setup_k3s.yaml` instala Cilium y deshabilita `servicelb`/`local-storage` (incompatible con LXC 800); OpenTofu `lab` diverge de Ansible `lab` |
| `AUD-CI-PUBDAG-001` | CI/CD & Supply Chain | `P1` | `HIGH` | `M` | Job `publish` en `ci.yaml` publica y firma en GHCR sin esperar a `sonarcloud` (tests), `frontend-web` ni `infra` |
| `AUD-CI-IMPACT-001` | Motor Impacto CI | `P1` | `HIGH` | `S` | `.agents/**/*.ts` solo dispara `docs-gate`; cambios en `_helpers.tpl`, `*.tf` y `ansible.cfg` omiten ejecución de tests |
| `AUD-DEP-SCA-001` | Dependencias / SCA | `P1` | `HIGH` | `S` | 5 vulnerabilidades moderadas (`glob`, `minimatch`) rompen ejecución de `Dependabot Updates` en `main` |
| `AUD-CFG-DOCKERIGN-001` | Config Hygiene | `P1` | `HIGH` | `XS` | `apps/*/.dockerignore` son inefectivos por `context: .`; `.dockerignore` raíz omite `backups/`, `*.sql*`, `*.enc`, `.agents/`, `.mcp/` |
| `AUD-DOC-DRIFT-001` | Docs & ADRs | `P1` | `HIGH` | `M` | Quickstart documenta `:3000` cerrado en Compose; cheat sheet K8s usa selector inválido; 4 ADRs activos presentan ADR Drift fáctico |
| `AUD-GOV-SKILLS-001` | Skills & Worktrees | `P1` | `HIGH` | `S` | 4 skills omitidas en README/matriz; `db-drizzle-ops` cita columna `fuerza` e índice GIN inexistentes; worktree no canónico activo |
| `AUD-SEC-AUTHCSRF-001` | Seguridad Auth | `P2` | `HIGH` | `S` | Logout omite `; Secure`, no valida CSRF y borra cookie antes de revocación en Redis; CSRF admite orígenes dev sin `!isProduction` |
| `AUD-SEC-HEADERS-001` | Bordes HTTP | `P2` | `HIGH` | `XS` | Nginx duplica cabeceras en `/metrics`; `ingress-nginx` sobrescribe CSP sin `object-src 'none'` y `Permissions-Policy` incompleta |
| `AUD-SEC-PGTLS-001` | Seguridad DB | `P2` | `HIGH` | `S` | `postgres.ts` usa `rejectUnauthorized: false` por defecto en TLS; `migrate.ts` no aplica `shouldUsePgSsl` |
| `AUD-SEC-INPUT-001` | Validación Input | `P2` | `HIGH` | `S` | `sanitizeAIHtml` permite `<svg/onload=...>` sin espacio; `schemas.ts` omite validación en raíz de `body.habitat` |
| `AUD-INF-EGRESS-001` | Zero-Trust K8s | `P2` | `HIGH` | `M` | `seed-job` y `dr-restore-verify` sin egress policy; `backup.offsite` sin `to:`; `ServiceMonitor` sin token en cloud |
| `AUD-IAC-HARDEN-001` | Hardening IaC | `P2` | `HIGH` | `M` | LXC 800 con `unprivileged = false`, `swap = 1024` y sin firewall; Ansible `curl \| sh` sin SHA-256; `setup_vault.yaml` escribe en `infra/` |
| `AUD-CI-GATES-001` | Gobernanza CI/Supply | `P2` | `HIGH` | `S` | `dr-simulation.yaml` reporta éxito fijo con `if: always()`; `hadolint`/`trivy-iac` no bloquean; Kyverno fuera de ArgoCD |
| `AUD-CI-UNKNOWN-001` | Contrato Impacto CI | `P2` | `HIGH` | `S` | 47 archivos (incl. `@pokedex/contracts` y 24 scripts) caen en `unknown`; 3 rutas fantasma en `ci-impact.yaml` |
| `AUD-QUAL-CAPAS-001` | Calidad App / UI | `P2` | `HIGH` | `M` | `?tipo=` ignora tipos secundarios en PG; `db.ts` hace `PING` continuo a Redis; barras de UI sin `%`; `#btnSyncCache` no invalida |
| `AUD-DEP-HYGIENE-001` | Higiene npm | `P2` | `HIGH` | `XS` | Override huérfano `tmp`, copia escapada `js-yaml@4.3.2` en `cosmiconfig` y supuesto obsoleto de Zod 3 |
| `AUD-TST-GAPS-001` | Cobertura & E2E | `P2` | `HIGH` | `M` | `coverage:gate` ignora `middleware/`, `validation/` y `frontend/`; Playwright no prueba Nginx/PG/Redis ni mutaciones CRUD |
| `AUD-CFG-SECREVIEW-001` | Exclusiones Seg. & MCP | `P2` | `HIGH` | `S` | 4 rutas muertas en allowlist de Gitleaks; `skip-path` en Checkov sin justificar; contradicción documental en perfil MCP |
| `AUD-QUAL-HOTSPOTS-001` | Modularidad / Docker | `P3` | `HIGH` | `M` | Hotspots `pokedex.ts` (549 LOC) y `pokemon.repository.ts` (464 LOC); UID `1000` vs `10001`; contracts en `dependencies` |
| `AUD-MNT-SCRIPTS-001` | Scripts & Taskfile | `P3` | `HIGH` | `S` | 4 scripts sin tests directos; cliente Linear duplicado; `taskfiles/dev.yaml` con rutas/puertos desalineados |
| `AUD-TST-SMELLS-001` | Calidad de Tests | `P3` | `HIGH` | `S` | 8 God Test Files (`>500` LOC); aserto vacuo `assert.ok(true)` en `pentest.test.ts`; esperas arbitrarias `setTimeout` |
| `AUD-CI-REDUNDANCY-001` | Eficiencia CI/Hooks | `P3` | `HIGH` | `S` | `printf` sin formato seguro en CI; divergencia de versión Gitleaks en pre-commit; builds de contenedores redundantes |
| `AUD-GOV-SKILLCTR-001` | Contrato de Skills | `P3` | `HIGH` | `XS` | 5 skills omiten enlace a `skill-contract.md`; invocación Docker directa sin `repo-tool-exec`; rutas desalineadas en `_shared/` |

---

## 4. Configuration Hygiene (`configuration-hygiene`)

- **Archivos `.dockerignore` redundantes:** `apps/backend/.dockerignore` y `apps/frontend/.dockerignore` marcados para `REMOVE`.
- **Exclusiones críticas añadidas:** `.dockerignore` raíz requiere incorporar `backups/`, `*.sql*`, `*.enc`, `.agents/`, `.mcp/`, `.tools/`, `*_data/` y rutas actualizadas de Playwright y Lighthouse.
- **Limpieza de reglas obsoletas:** eliminación de `.pytest_cache/`, `.nyc_output/`, logs de Yarn/Pnpm y referencias residuales a Terraform en `.gitignore` y `.markdownlintignore`.
- **Revisiones de seguridad:** acotar allowlist en `.gitleaks.toml`, justificar `infra/k8s/jobs` en Checkov y eliminar `tmp/delete-draft-releases.ts` o promoverlo formalmente.
