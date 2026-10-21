# Auditoría Integral (`full-audit`) — Baseline 2026-10-21

> **Estado:** Histórico (snapshot inmutable; su frescura se evalúa con `audit-freshness.ts`)
>
> **Fecha de captura:** 2026-10-21
>
> **Commit:** `b38568ef018ee51ec685ab837935e207d8c7d673`
>
> **Rama auditada:** `main` (release `v1.119.0`)
>
> [!IMPORTANT]
> Este documento es evidencia histórica del commit auditado. No es SSOT: el estado vigente
> reside en `apps/`, `infra/`, `gitops/`, `scripts/`, `tests/` y `docs/architecture/`.
> El estado de cada hallazgo se sigue fuera del snapshot (issue con título `AUD-*`).

**Repositorio:** `rocapellino/pokedex`
**Contexto Operativo:** Monorepo (`apps/backend`, `apps/frontend`, `packages/contracts`) | Entornos: Kind / Proxmox Pre-prod / Prod Cloud (blueprint)
**Vocabulario de estados:** gates según [state-model.md](../../../.agents/skills/_shared/state-model.md) §3 (`PASS`, `FAIL`, `NOT_EXECUTED`, `CI_REQUIRED`).
**Foco de la sesión:** reemplazar el baseline anterior del mismo día (commit `0952a31a`, `v1.118.0`) absorbiendo el plan de mejora posterior al baseline (PRs `#903` a `#907`), la promoción `v1.119.0` (`#904`) y la purga real de tags. Mantiene un único snapshot activo conforme a `max_active_snapshots: 1`.

---

## 1. Identificación y Paridad de Versión

| Componente | Valor auditado | Fuente |
| :--- | :--- | :--- |
| `package.json` | `1.119.0` | Versión de aplicación y monorepo |
| `infra/helm/pokedex/Chart.yaml` (`version` / `appVersion`) | `1.119.0` | Empaquetado Helm |
| GitOps `targetRevision` (manifiestos de `gitops/apps/`) | `v1.119.0` | Promoción ArgoCD |
| Último tag | `v1.119.0` | `git describe --tags --abbrev=0` |
| Tags remotos | `v1.117.0`, `v1.118.0`, `v1.119.0` | `git ls-remote --tags origin` |

La aplicación raíz de ArgoCD (`root-application.yaml`) mantiene `targetRevision: main`, por lo que `audit-freshness.ts` puede informar `GITOPS_REVISION` aun con las aplicaciones de entorno alineadas. El estado es informativo y no bloqueante.

El workflow `release-tag.yaml` falló en el primer intento de `v1.119.0` (`gitsign verify-tag`: `could not find matching tlog entry` en Rekor, tras firmar el tag y antes de empujarlo). Un reintento del job fallido completó el tag firmado y el release sin intervención adicional, por lo que se trata de un fallo transitorio de Sigstore.

---

## 2. Resumen Ejecutivo

El repositorio mantiene paridad de versión y de digests SHA256 entre Cloud GitOps, Proxmox Pre-prod y Helm Production, gobernanza documental sin drift y una suite de pruebas sin fallos en los niveles ejecutables localmente. La retención de tags se verificó por primera vez contra el remoto real (el baseline anterior solo evaluó datos sintéticos) y se ejecutó la purga: quedan 3 tags remotos. La auditoría detectó dos hallazgos abiertos de severidad baja en la gobernanza de retención.

- **Total de Hallazgos Abiertos:** 2
- **P0 (Crítico):** 0
- **P1 (Alto):** 0
- **P2 (Medio):** 0
- **P3 (Bajo):** 2 (`AUD-REL-GHCR-001`, `AUD-REL-DRAFT-001`; 3 consolidados de este ciclo)

### Gates Automáticos

| Gate | Estado | Evidencia |
| :--- | :--- | :--- |
| `npm run typecheck` | `PASS` | TypeScript compila sin errores en raíz, workspaces y `@pokedex/contracts` |
| `npm run lint` | `PASS` | Biome verifica 329 archivos con 0 errores y 0 advertencias |
| `npm run docs:validate` | `PASS` | 100% de los documentos cumplen compuertas de gobernanza sin drift |
| `npm run lint:md` | `PASS` | 156 archivos Markdown validados con 0 errores `MDxxx` |
| `npm run lint:ignore:strict` | `PASS` | 7 archivos `.ignore` validados en modo estricto |
| `npm run lint:yaml:strict` | `PASS` | 0 archivos `.yml` (política canónica `.yaml` cumplida al 100%) |
| `npm run test:surface:check` | `PASS` | Catálogo sincronizado sin drift (188 archivos, 167 activos, 1245 casos) |
| `npm run nginx:conf:check` | `PASS` | `apps/frontend/nginx.conf` sincronizado con la plantilla (`APPS-001`) |
| `npm run gitops:verify-parity:strict` | `PASS` | Paridad de digests SHA256 entre Cloud GitOps, Proxmox Preprod y Helm Production |
| `npm run gitops:pin:check` | `PASS` | Coherencia de `targetRevision: v1.119.0` en manifiestos de ArgoCD |
| `npm run secrets:audit-rotation` | `PASS` | 12/12 controles de la arquitectura dual (Reloader Cloud / Rollout Proxmox) |
| `npm run governance:audit-scripts` | `PASS` | 28/28 tests de gobernanza y seguridad de scripts e IaC |
| `npm run mcp:validate` / `mcp:scan` / `mcp:test` | `PASS` | 9 servidores (8 activos), 8 perfiles y 5 clientes; escaneo Zero-Trust sin vulnerabilidades; 48/48 tests |
| `npm run worktree:doctor` | `PASS` | Worktrees gobernados sin prunables ni fuera de política |
| `npm run aas:governance` | `PASS` | AAS Core 18.6.0 con gobierno local válido |
| `npm audit --package-lock-only` | `PASS` | 0 vulnerabilidades en el lockfile. Se audita el lockfile porque el `node_modules` local compartido puede estar desactualizado y producir falsos positivos |
| `npm run test:unit` | `PASS` | 243 tests superados (0 fallos) |
| `npm run test:contracts` | `PASS` | 335 tests (334 superados, 1 omitido justificado en entorno live de GitHub) |
| `npm run test:security` | `PASS` | 212 tests superados (0 fallos) |
| `npm run test:gitops` | `PASS` | 43 tests superados (0 fallos) |
| `npm run test:frontend` | `PASS` | 374 tests superados (0 fallos) |
| `npm run test:integration` | `PASS` | 48 tests superados (0 fallos) |
| `npm run test:fuzz` | `PASS` | 7 tests superados (0 fallos) |
| `npm run probe:security:egress` | `PASS` | Validación determinista de Anti-SSRF y Egress Cilium L7 |
| `npm run tags:retention:dry-run` (con `GITHUB_TOKEN`) | `PASS` | `Modo Simulado: NO`; 3 tags remotos, los 3 retenidos por jerarquía SemVer, 0 candidatos a purga |
| `npm run ghcr:retention:dry-run` (local) | `NOT_EXECUTED` | El token local carece del scope `read:packages` (HTTP 403); el script lo ignora y termina en éxito (ver `AUD-REL-GHCR-001`). La verificación real proviene de la ejecución de CI posterior al release |
| Suites con render Helm (`npm test`) | `CI_REQUIRED` | Requieren `helm` o Docker; sin ellos fallan en local (`helm no disponible`). Validadas en CI: `Core CI` del PR `#907` (ejecución `39649629709`) con SonarQube Cloud, Auditoría de Calidad y Quality Gate en verde. El commit de promoción `b38568ef` solo cambia metadatos de versión y no ejecuta `Core CI` por `[skip-release]` |

---

## 3. Matriz de Hallazgos y Remediaciones Consolidadas

| ID | Área | Evidencia (`ruta:línea`) | Riesgo / Impacto | Prioridad | Confianza | Esfuerzo | Estado | Acción / Remediación |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `AUD-REL-GHCR-001` | Supply Chain / Retención OCI | `scripts/ghcr-retention.ts:264-265` (`catch` con `continue`) y `scripts/ghcr-retention.ts:328` | Un fallo al consultar un paquete (403, caída de API) se registra con `console.error`, el script continúa, imprime `Política de retención aplicada con éxito` y termina con código 0. Un job de CI sobre un token sin scope o una API caída se reportaría como exitoso sin haber evaluado ni purgado nada (diseño fail-open en un control de gobernanza, contrario a ADR-027). Observado en la ejecución local, con 403 en los 3 paquetes. | `P3` | `HIGH` | `XS` | `OPEN` | Acumular los paquetes con error, no imprimir el mensaje de éxito y terminar con código distinto de cero si alguno falla; test de regresión previo con un `fetchFn` que devuelva 403. |
| `AUD-REL-DRAFT-001` | Release / Higiene | `docs/operations/TAG_RETENTION_POLICY.md:14`; `gh release list` | La política de retención opera solo sobre `refs/tags/*` y no elimina GitHub Releases: cada tag purgado deja un release en estado *Draft*. Se contaron 197 borradores entre los primeros 200 releases listados, incluidos los 7 de la purga de este ciclo, sin tag, sin assets y sin consumidor conocido. El número crece con cada release. | `P3` | `MEDIUM` | `S` | `OPEN` | Decidir con el responsable del release si los borradores huérfanos se eliminan (acción manual sobre releases, no reversible) o se documentan como aceptados en `TAG_RETENTION_POLICY.md`. Si se eliminan, automatizarlo con el mismo criterio de retención. |
| `AUD-REL-RET-001` | Release / Retención | `scripts/tag-retention.ts`, `scripts/ghcr-retention.ts`, `docs/operations/TAG_RETENTION_POLICY.md` | Con `GITHUB_TOKEN` ausente, ambos scripts pasaban a simulación automática pero imprimían `Modo Simulado : NO` y cerraban con un mensaje de éxito; el baseline anterior registró una simulación de 20 tags sintéticos como verificación. | `P3` | `HIGH` | `S` | `CLOSED` | `Modo Simulado` refleja la simulación efectiva, ambos scripts avisan `RESULTADO SIMULADO` al final y la política documenta el requisito de token y `git fetch --prune --prune-tags`, con un test por script, en PR `#907`. Purga real ejecutada desde `tag-retention.yaml`: se eliminaron `v1.116.3`, `v1.116.2`, `v1.116.1`, `v1.116.0`, `v1.115.0`, `v1.114.2` y `v1.113.3`. |
| `AUD-MCP-TRACE-001` | Gobernanza / MCP | `scripts/mcp/audit.ts`, `tests/unit/mcp/mcp_audit_hitl.test.ts` | El contexto `traceparent` no llegaba a los procesos hijo de `mcp:doctor` y el log de auditoría crecía sin límite. | `P3` | `HIGH` | `XS` | `CLOSED` | `TRACEPARENT` expuesto durante la operación y restaurado después, también ante excepción, y rotación a `tmp/mcp-audit.1.jsonl` al superar 1 MiB, en PR `#906`. |
| `AUD-DEP-MDIT-001` | Dependencias / SCA | `package-lock.json` (`markdown-it`, vía `markdownlint-cli`) | Denegación de servicio cuadrática en el parseo de Markdown, limitada a tooling de desarrollo. | `P2` | `HIGH` | `XS` | `CLOSED` | Lockfile actualizado a `markdown-it 14.3.3` dentro del rango `~14.3.0`, en PR `#903`. Verificado en un clon limpio: `npm ci` sin errores, 0 vulnerabilidades y 0 paquetes `extraneous`. |

Hallazgos cerrados consolidados del baseline anterior (consultables en el historial de Git con `git log --stat -- docs/audits/`): `AUD-DB-CONN-001` (`#894`), `AUD-DB-PREP-001` (`#901`), `AUD-TOOL-BIOME-001` (`#896`), `AUD-GOV-EVAL-001` (`#898`), `AUD-MCP-SCAN-001` (`#899`) y `AUD-MCP-HITL-001` (`#900`).

### Decisiones sobre el plan de tercera generación y el plan posterior al baseline

- **`drizzle-zod`:** descartada. Solo coinciden dos campos (`nombre`, `tipo`) entre la tabla `pokedex_entries` y los schemas Zod, con límites intencionalmente más estrictos en Zod y comprobaciones anti-XSS que la derivación no genera. El payload vive en una columna `jsonb` no derivable, y Zod no puede salir de `apps/backend/` (`AUD-DEP-ZOD-001`).
- **Pool `max: 2-5` y `prepare: false`:** no aplicados. El pool vigente es `max: 10` (ADR-011 y ADR-031) y `prepare` es una opción de `postgres.js`, no de `node-postgres`.
- **Suites con render Helm en local:** sin cambios. `scripts/lib/helm.ts` ya indica en una línea qué instalar o iniciar, y el modo estricto de CI se conserva.
- **Promoción `v1.119.0`:** el PR `#902` fue sustituido por `#904`, fusionado; el tag firmado y el release se completaron tras reintentar el job fallido.

---

## 4. Detalle de Hallazgos Significativos (P0 / P1)

No se registraron hallazgos P0 ni P1 al cierre de este ciclo.

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
| Ramas remotas | Solo `main`. Todas las ramas de trabajo fusionadas se eliminaron. |
| Worktrees (`worktree:doctor`) | Sin huérfanos, prunables ni fuera de política. |
| Tags remotos (`tags:retention:dry-run`, real) | 3 tags, todos retenidos por jerarquía; 0 candidatos a purga. |

Candidatos pendientes de aprobación humana (fase 5 del protocolo; no se ejecutan durante la auditoría):

| Candidato | Estado | Justificación |
| :--- | :--- | :--- |
| Releases en borrador sin tag (197 contados entre los primeros 200 listados) | `REVIEW` | Ver `AUD-REL-DRAFT-001`: la eliminación de releases no es reversible y la política actual no la cubre. |
| Tags locales de clones antiguos (295 en el clon auditado frente a 3 en el remoto) | `REVIEW` | Dependen de cada máquina; se sincronizan con `git fetch --prune --prune-tags`, ahora documentado en `TAG_RETENTION_POLICY.md`. |

---

## 7. Cambios Propuestos y Roadmap

1. **Inmediato (P0/P1):** Ninguno requerido.
2. **Medio Plazo (P2):** Ninguno abierto.
3. **Mantenimiento Continuo (P3):** corregir `AUD-REL-GHCR-001` con test de regresión previo; decidir `AUD-REL-DRAFT-001`; valorar un reintento automático acotado para el paso `gitsign verify-tag` de `release-tag.yaml`, tras un único fallo transitorio de Rekor observado en este ciclo (evidencia insuficiente para abrir un hallazgo).

---

## 8. Checklist de Verificación y Criterios de Aceptación

- [x] **Compilación & Tipado:** `npm run typecheck` en verde.
- [x] **Linters de Código:** `npm run lint` (Biome) limpio en 329 archivos.
- [x] **Gobernanza Documental & Markdown Gate:** `npm run docs:validate` y `npm run lint:md` sin fallos (156 archivos Markdown).
- [x] **Higiene de Configuración:** `npm run lint:ignore:strict` y `npm run lint:yaml:strict` en verde.
- [x] **Superficie de Testing:** `npm run test:surface:check` sincronizado (1245 casos en catálogo).
- [x] **Gobernanza de Secretos:** `npm run secrets:audit-rotation` (12/12 controles).
- [x] **Supply Chain & GitOps:** `npm run gitops:verify-parity:strict` y `npm run gitops:pin:check` certificados en `v1.119.0`.
- [x] **Dependencias:** `npm audit --package-lock-only` en 0 vulnerabilidades.
- [x] **Anti-SSRF & Egress:** `npm run probe:security:egress` verificado en modo determinista.
- [x] **Gobernanza de Worktrees & MCP:** `npm run worktree:doctor`, `npm run mcp:validate`, `npm run mcp:scan` y `npm run mcp:test` validados.
- [x] **Retención de Tags:** verificada contra el remoto real, sin simulación.
- [ ] **Retención de GHCR en local:** `NOT_EXECUTED` por falta de scope `read:packages`; ver `AUD-REL-GHCR-001`.
- [ ] **Suites con render Helm:** `CI_REQUIRED` en local; en verde en el CI del PR `#907`.
- [x] **Retención de Auditorías:** Un único baseline activo conforme a `max_active_snapshots: 1`.
