# Auditoría Integral (`full-audit`) — Baseline 2026-10-21

> **Estado:** Histórico (snapshot inmutable; su frescura se evalúa con `audit-freshness.ts`)
>
> **Fecha de captura:** 2026-10-21
>
> **Commit:** `0952a31a338f2f7a60607aacffb0945d61cd45e5`
>
> **Rama auditada:** `main` (release `v1.118.0`)
>
> [!IMPORTANT]
> Este documento es evidencia histórica del commit auditado. No es SSOT: el estado vigente
> reside en `apps/`, `infra/`, `gitops/`, `scripts/`, `tests/` y `docs/architecture/`.
> El estado de cada hallazgo se sigue fuera del snapshot (issue con título `AUD-*`).

**Repositorio:** `rocapellino/pokedex`
**Contexto Operativo:** Monorepo (`apps/backend`, `apps/frontend`, `packages/contracts`) | Entornos: Kind / Proxmox Pre-prod / Prod Cloud (blueprint)
**Vocabulario de estados:** gates según [state-model.md](../../../.agents/skills/_shared/state-model.md) §3 (`PASS`, `FAIL`, `NOT_EXECUTED`, `CI_REQUIRED`).
**Foco de la sesión:** consolidar la auditoría integral (`full-audit`) absorbiendo el plan de mejoras de tercera generación (persistencia, tooling, gobernanza de agentes y blindaje Zero-Trust MCP; PRs `#894`, `#896`, `#898`, `#899`, `#900` y `#901`), depurar el árbol de trabajo y mantener un único snapshot activo conforme a `max_active_snapshots: 1`.

---

## 1. Identificación y Paridad de Versión

| Componente | Valor auditado | Fuente |
| :--- | :--- | :--- |
| `package.json` | `1.118.0` | Versión de aplicación y monorepo |
| `infra/helm/pokedex/Chart.yaml` (`version` / `appVersion`) | `1.118.0` | Empaquetado Helm |
| GitOps `targetRevision` (manifiestos de `gitops/apps/`) | `v1.118.0` | Promoción ArgoCD |
| Último tag | `v1.118.0` | `git describe --tags --abbrev=0` |

La aplicación raíz de ArgoCD (`root-application.yaml`) mantiene `targetRevision: main`, por lo que `audit-freshness.ts` puede informar `GITOPS_REVISION` aun con las aplicaciones de entorno alineadas. El estado es informativo y no bloqueante. Al capturar este baseline existe una promoción de release abierta (`v1.119.0`, PR `#902`) que aún no forma parte de `main`.

---

## 2. Resumen Ejecutivo

El repositorio mantiene paridad de versión y de digests SHA256 entre Cloud GitOps, Proxmox Pre-prod y Helm Production, gobernanza documental sin drift y una suite de pruebas sin fallos en los niveles ejecutables localmente. La auditoría detectó una vulnerabilidad de severidad alta en `npm audit` (`markdown-it`, dependencia transitiva de desarrollo vía `markdownlint-cli`), corregida en este mismo ciclo con la actualización del lockfile a `14.3.3`.

- **Total de Hallazgos Abiertos:** 0
- **P0 (Crítico):** 0
- **P1 (Alto):** 0
- **P2 (Medio):** 0 (1 remediado en este ciclo)
- **P3 (Bajo):** 0 (6 consolidados del plan de tercera generación)

### Gates Automáticos

| Gate | Estado | Evidencia |
| :--- | :--- | :--- |
| `npm run typecheck` | `PASS` | TypeScript compila sin errores en raíz, workspaces y `@pokedex/contracts` |
| `npm run lint` | `PASS` | Biome verifica 329 archivos con 0 errores y 0 advertencias |
| `npm run docs:validate` | `PASS` | 100% de los documentos cumplen compuertas de gobernanza sin drift |
| `npm run lint:md` | `PASS` | 156 archivos Markdown validados con 0 errores `MDxxx` |
| `npm run lint:ignore:strict` | `PASS` | 7 archivos `.ignore` validados en modo estricto |
| `npm run lint:yaml:strict` | `PASS` | 0 archivos `.yml` (política canónica `.yaml` cumplida al 100%) |
| `npm run test:surface:check` | `PASS` | Catálogo sincronizado sin drift (188 archivos, 167 activos, 1241 casos) |
| `npm run nginx:conf:check` | `PASS` | `apps/frontend/nginx.conf` sincronizado con la plantilla (`APPS-001`) |
| `npm run gitops:verify-parity:strict` | `PASS` | Paridad de digests SHA256 entre Cloud GitOps, Proxmox Preprod y Helm Production |
| `npm run gitops:pin:check` | `PASS` | Coherencia de `targetRevision: v1.118.0` en manifiestos de ArgoCD |
| `npm run secrets:audit-rotation` | `PASS` | 12/12 controles de la arquitectura dual (Reloader Cloud / Rollout Proxmox) |
| `npm run governance:audit-scripts` | `PASS` | 28/28 tests de gobernanza y seguridad de scripts e IaC |
| `npm run mcp:validate` / `mcp:scan` / `mcp:test` | `PASS` | 9 servidores (8 activos), 8 perfiles y 5 clientes; escaneo Zero-Trust sin vulnerabilidades; 46/46 tests |
| `npm run worktree:doctor` | `PASS` | Worktrees gobernados sin prunables ni fuera de política |
| `npm run aas:governance` | `PASS` | AAS Core 18.6.0 con gobierno local válido |
| `npm audit` | `PASS` | 0 vulnerabilidades tras actualizar `markdown-it` a `14.3.3` (antes: 1 alta, `GHSA-vfgh-jcmw-g37q` y `GHSA-gfr2-rv44-r23c`) |
| `npm run test:unit` | `PASS` | 241 tests superados (0 fallos) |
| `npm run test:contracts` | `PASS` | 333 tests (332 superados, 1 omitido justificado en entorno live de GitHub) |
| `npm run test:security` | `PASS` | 212 tests superados (0 fallos) |
| `npm run test:gitops` | `PASS` | 43 tests superados (0 fallos) |
| `npm run test:frontend` | `PASS` | 374 tests superados (0 fallos) |
| `npm run test:integration` | `PASS` | 48 tests superados (0 fallos) |
| `npm run test:fuzz` | `PASS` | 7 tests superados (0 fallos) |
| `npm run probe:security:egress` | `PASS` | Validación determinista de Anti-SSRF y Egress Cilium L7 |
| `npm run test` (suites con render Helm) | `CI_REQUIRED` | Requieren `helm` o Docker; sin ellos fallan en local (`helm no disponible`) y se validan en CI |

---

## 3. Matriz de Hallazgos y Remediaciones Consolidadas

| ID | Área | Evidencia (`ruta:línea`) | Riesgo / Impacto | Prioridad | Confianza | Esfuerzo | Estado | Acción / Remediación |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `AUD-DEP-MDIT-001` | Dependencias / SCA | `package-lock.json` (`markdown-it` 14.3.2, vía `markdownlint-cli`) | Denegación de servicio cuadrática en el parseo de Markdown. Alcance limitado a tooling de desarrollo sobre documentos propios. | `P2` | `HIGH` | `XS` | `CLOSED` | Lockfile actualizado a `markdown-it 14.3.3` dentro del rango `~14.3.0`; `npm audit` en 0. |
| `AUD-DB-CONN-001` | Persistencia | `apps/backend/src/services/postgres.ts`, `apps/backend/src/db/migrate.ts`, `scripts/check-migration-hygiene.ts` | Migraciones y seeding compartían la ruta de conexión del runtime (PgBouncer). | `P2` | `HIGH` | `M` | `CLOSED` | Segregación `DATABASE_URL` (PgBouncer 6432) y `DIRECT_DATABASE_URL` (PostgreSQL 5432), y linter `db:lint-migrations` para índices concurrentes, en PR `#894`. |
| `AUD-DB-PREP-001` | Persistencia | `tests/unit/drizzle_contract.test.ts` | Riesgo de sentencias preparadas con nombre incompatibles con PgBouncer en modo transacción. | `P3` | `HIGH` | `XS` | `CLOSED` | Verificado que el backend no las usa y añadido un test de contrato que impide introducirlas, en PR `#901`. |
| `AUD-TOOL-BIOME-001` | Tooling | `biome.json`, `Taskfile.yaml`, `taskfiles/` | Configuración de Biome sin overrides por workspace, configs web en la raíz y tareas sin caché. | `P3` | `HIGH` | `S` | `CLOSED` | Biome por workspaces, configs web desacopladas en `apps/frontend/` y caché `sources`/`generates` en Taskfile, en PR `#896`. |
| `AUD-GOV-EVAL-001` | Gobernanza / Agentes | `AGENTS.md`, `.agents/references/_sections.md`, `.agents/evals/` | Contexto de agentes con narrativa histórica y sin evaluaciones conductuales. | `P3` | `HIGH` | `M` | `CLOSED` | `AGENTS.md` con standing instructions, referencias contrastivas y 4 evals, en PR `#898`. |
| `AUD-MCP-SCAN-001` | Gobernanza / MCP | `scripts/mcp/scan.ts`, `.mcp/registry.yaml` | Sin detección de Tool Poisoning, versiones flotantes ni *metadata drift* en el catálogo MCP. | `P3` | `HIGH` | `M` | `CLOSED` | Escáner Zero-Trust `mcp:scan` en pre-commit y CI, en PR `#899`. |
| `AUD-MCP-HITL-001` | Gobernanza / MCP | `scripts/mcp/validate.ts`, `scripts/mcp/generate.ts`, `scripts/mcp/audit.ts` | Sin garantía de confirmación humana ni trazabilidad de las operaciones de gobernanza MCP. | `P3` | `HIGH` | `S` | `CLOSED` | Rechazo de auto-aprobación (`autoApprove`, `alwaysAllow`, `autoStart`, `trust`), mutación solo bajo aprobación explícita y auditoría JSONL con `traceparent` W3C (ADR-018), en PR `#900`. |

Los hallazgos de ciclos anteriores (`js-yaml v5`, PostgreSQL 17 / Valkey 8, PgBouncer 1.25.2, KaTeX 0.19.0, herramientas CLI con checksum, `@pokedex/contracts` y skills de arquitectura) permanecen cerrados y consultables en el historial de Git (`git log --stat -- docs/audits/`).

### Decisiones sobre el plan de tercera generación

- **Derivación de schemas con `drizzle-zod`:** descartada. Solo coinciden dos campos (`nombre`, `tipo`) entre la tabla `pokedex_entries` y los schemas Zod, con límites intencionalmente más estrictos en Zod (60 y 30 frente a 100 y 50 caracteres) y comprobaciones anti-XSS que la derivación no genera. El resto del payload vive en la columna `jsonb`, que no es derivable, y `PokemonPayloadSchema` es un `superRefine` manual. Además, Zod no puede salir de `apps/backend/` (`AUD-DEP-ZOD-001`).
- **Pool `max: 2-5` y `prepare: false`:** no aplicados. El pool vigente es `max: 10` (ADR-011 y ADR-031) y `prepare` es una opción de `postgres.js`, no de `node-postgres`.

---

## 4. Detalle de Hallazgos Significativos (P0 / P1)

No se registraron hallazgos P0 ni P1 al cierre de este ciclo. La única vulnerabilidad de severidad alta detectada durante la auditoría (`AUD-DEP-MDIT-001`) se evaluó como `P2` por limitarse a tooling de desarrollo y se cerró en el mismo ciclo.

---

## 5. Configuration Hygiene

### 1. `.ignore inventory`

Catálogo inspeccionado mediante `scripts/check-ignore-hygiene.ts`:

1. `.dockerignore` (raíz): 69 reglas activas, 113 líneas.
2. `.gitignore` (raíz): 94 reglas activas, 156 líneas.
3. `.markdownlintignore` (raíz): 13 reglas activas, 14 líneas.
4. `.semgrepignore` (raíz): 12 reglas activas, 39 líneas.
5. `apps/backend/.dockerignore`: 32 reglas activas, 50 líneas.
6. `apps/frontend/.dockerignore`: 30 reglas activas, 48 líneas.
7. `infra/helm/pokedex/.helmignore`: 25 reglas activas, 43 líneas.

### 2. Obsolete / Missing / Overbroad rules

Ninguna regla obsoleta, faltante ni desmedida detectada. Los patrones de artefactos transitorios (`tmp/`, `dist/`, `node_modules/`, `.worktrees/`, `.mcp/*.local.json`) están presentes de forma homogénea.

### 3. Security-sensitive exclusions

- `.env` y variantes excluidas en `.gitignore` y en los `.dockerignore` de raíz y de cada workspace.
- Certificados y llaves privadas (`*.pem`, `*.key`) excluidos en `.gitignore`.
- `/tmp/` aislado conforme a `repository-hygiene.md`.
- Configuraciones locales de clientes MCP protegidas en `.gitignore`.

### 4. Recommended changes

| Archivo | Regla / Patrón | Clasificación | Justificación |
| :--- | :--- | :--- | :--- |
| `.gitignore` | Reglas actuales | `KEEP` | Cubre artefactos, secretos, worktrees y entornos locales. |
| `.dockerignore` | Reglas raíz y apps | `KEEP` | Minimiza el contexto de build y previene filtración de secretos. |
| `.markdownlintignore` | Reglas de documentación | `KEEP` | Alineado con el presupuesto documental y templates. |
| `.semgrepignore` | Reglas de SAST | `KEEP` | Excluye fixtures de tests y código generado. |
| `infra/helm/pokedex/.helmignore` | Reglas de chart | `KEEP` | Evita empaquetar values locales o documentación en el chart OCI. |

---

## 6. Depuración del Repositorio

Diagnóstico de solo lectura conforme a [cleanup-protocol.md](../../../.agents/skills/_shared/cleanup-protocol.md):

| Control | Resultado |
| :--- | :--- |
| Scripts `.sh` (ADR-020) | Solo `scripts/dr_verify_restore.sh`, la excepción autorizada. |
| Archivos `.yml` | 0. |
| Residuos versionados (`.bak`, `.tmp`, `.orig`, `.rej`, `.swp`) | 0. |
| Contenido versionado bajo `tmp/` | 0. |
| Worktrees (`worktree:doctor`) | Sin huérfanos, prunables ni fuera de política. |
| Retención de tags (`tags:retention`) | Política jerárquica sin hallazgos en modo simulado. |

Candidatos pendientes de aprobación humana (fase 5 del protocolo; no se ejecutan durante la auditoría):

| Candidato | Estado | Justificación |
| :--- | :--- | :--- |
| Rama local `feat/mcp-hitl-trazabilidad-w3c` | `DELETE` | Su PR `#900` está fusionado (squash). |
| Rama remota `origin/feat/mcp-hitl-trazabilidad-w3c` | `DELETE` | Su PR `#900` está fusionado (squash) y la rama no se eliminó. |
| Rama remota `origin/release/promote-v1.119.0` | `KEEP` | Pertenece al PR de promoción `#902`, aún abierto. |

---

## 7. Cambios Propuestos y Roadmap

1. **Inmediato (P0/P1):** Ninguno requerido.
2. **Medio Plazo (P2):** Ninguno abierto.
3. **Mantenimiento Continuo (P3):** Aprobar y ejecutar la eliminación de las ramas fusionadas (sección 6) y vigilar versiones menores y parches mediante Renovate y Dependency Review en CI.

---

## 8. Checklist de Verificación y Criterios de Aceptación

- [x] **Compilación & Tipado:** `npm run typecheck` en verde.
- [x] **Linters de Código:** `npm run lint` (Biome) limpio en 329 archivos.
- [x] **Gobernanza Documental & Markdown Gate:** `npm run docs:validate` y `npm run lint:md` sin fallos (156 archivos Markdown).
- [x] **Higiene de Configuración:** `npm run lint:ignore:strict` y `npm run lint:yaml:strict` en verde.
- [x] **Superficie de Testing:** `npm run test:surface:check` sincronizado (1241 casos en catálogo).
- [x] **Gobernanza de Secretos:** `npm run secrets:audit-rotation` (12/12 controles).
- [x] **Supply Chain & GitOps:** `npm run gitops:verify-parity:strict` y `npm run gitops:pin:check` certificados en `v1.118.0`.
- [x] **Dependencias:** `npm audit` en 0 vulnerabilidades.
- [x] **Anti-SSRF & Egress:** `npm run probe:security:egress` verificado en modo determinista.
- [x] **Gobernanza de Worktrees & MCP:** `npm run worktree:doctor`, `npm run mcp:validate`, `npm run mcp:scan` y `npm run mcp:test` validados.
- [ ] **Suites con render Helm:** `CI_REQUIRED` (sin `helm` ni Docker en el entorno de captura).
- [x] **Retención de Auditorías:** Un único baseline activo conforme a `max_active_snapshots: 1`.
