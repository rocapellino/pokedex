# Auditoría Integral (`full-audit`) — Baseline 2026-10-22

> **Estado:** Histórico (snapshot inmutable; su frescura se evalúa con `audit-freshness.ts`)
>
> **Fecha de captura:** 2026-10-22
>
> **Commit:** `9b10935ff13037be644e9857a5b0a0b3a7cb7d70`
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
**Foco de la sesión:** reemplazar el baseline `2026-10-21` (commit `b38568ef`) absorbiendo los PRs `#914` a `#919` y `#921`: retención de GHCR (errores, paginación, protección de imágenes de rollback y `dry_run` por defecto), limpieza de releases en borrador, actualización de dependencias y corrección de la intermitencia del job de Kind. Mantiene un único snapshot activo conforme a `max_active_snapshots: 1`.

---

## 1. Identificación y Paridad de Versión

| Componente | Valor auditado | Fuente |
| :--- | :--- | :--- |
| `package.json` | `1.119.0` | Versión de aplicación y monorepo |
| `infra/helm/pokedex/Chart.yaml` (`version` / `appVersion`) | `1.119.0` | Empaquetado Helm |
| GitOps `targetRevision` (manifiestos de `gitops/apps/`) | `v1.119.0` | Promoción ArgoCD |
| Último tag y release publicado | `v1.119.0` | `git ls-remote --tags origin`, `gh release list` |
| Tags remotos | `v1.117.0`, `v1.118.0`, `v1.119.0` | `git ls-remote --tags origin` |
| Releases (publicados / borradores) | 3 / 0 | `gh api repos/rocapellino/pokedex/releases` |

La aplicación raíz de ArgoCD (`root-application.yaml`) mantiene `targetRevision: main`, por lo que `audit-freshness.ts` puede informar `GITOPS_REVISION` aun con las aplicaciones de entorno alineadas. El estado es informativo y no bloqueante.

`main` contiene desde el release `v1.119.0` siete PRs de corrección y tooling fusionados (`#914` a `#919` y `#921`) sin cambios de comportamiento de la aplicación. El PR de promoción `v1.119.1` (`#920`) se cerró sin fusionar, por lo que `package.json`, `Chart.yaml` y los pines de GitOps siguen en `1.119.0` y no existe un tag posterior.

---

## 2. Resumen Ejecutivo

El repositorio mantiene paridad de versión y de digests SHA256 entre Cloud GitOps, Proxmox Pre-prod y Helm Production, gobernanza documental sin drift y todas las suites ejecutables localmente en verde. Los dos hallazgos abiertos del baseline anterior y los tres detectados durante el ciclo quedaron cerrados con test de regresión. La auditoría de dependencias, que el 2026-10-21 no reportaba nada, detecta ahora dos avisos publicados después con versión corregida disponible.

- **Total de Hallazgos Abiertos:** 2
- **P0 (Crítico):** 0
- **P1 (Alto):** 0
- **P2 (Medio):** 2 (`AUD-DEP-DOMP-001`, `AUD-DEP-IPADDR-001`)
- **P3 (Bajo):** 0 (6 cerrados en este ciclo)

### Gates Automáticos

| Gate | Estado | Evidencia |
| :--- | :--- | :--- |
| `npm run typecheck` | `PASS` | TypeScript compila sin errores en raíz, workspaces y `@pokedex/contracts` |
| `npm run lint` | `PASS` | Biome verifica 330 archivos con 0 errores y 0 advertencias |
| `npm run docs:validate` | `PASS` | 100% de los documentos cumplen compuertas de gobernanza sin drift |
| `npm run lint:md` | `PASS` | 155 archivos Markdown validados con 0 errores `MDxxx` |
| `npm run lint:ignore:strict` | `PASS` | 7 archivos `.ignore` validados en modo estricto |
| `npm run lint:yaml:strict` | `PASS` | 0 archivos `.yml` (política canónica `.yaml` cumplida al 100%) |
| `npm run test:surface:check` | `PASS` | Catálogo sincronizado sin drift (168 archivos activos, 1265 casos) |
| `npm run nginx:conf:check` | `PASS` | `apps/frontend/nginx.conf` sincronizado con la plantilla (`APPS-001`) |
| `npm run gitops:verify-parity:strict` | `PASS` | Paridad de digests SHA256 entre Cloud GitOps, Proxmox Preprod y Helm Production |
| `npm run gitops:pin:check` | `PASS` | Coherencia de `targetRevision: v1.119.0` en manifiestos de ArgoCD |
| `npm run secrets:audit-rotation` | `PASS` | 12/12 controles de la arquitectura dual (Reloader Cloud / Rollout Proxmox) |
| `npm run governance:audit-scripts` | `PASS` | 28/28 tests de gobernanza y seguridad de scripts e IaC |
| `npm run mcp:validate` / `mcp:scan` / `mcp:test` | `PASS` | 9 servidores (8 habilitados) y 8 perfiles; escaneo Zero-Trust sin vulnerabilidades; 48/48 tests |
| `npm run worktree:doctor` | `PASS` | Worktrees gobernados sin prunables ni fuera de política |
| `npm run aas:governance` | `PASS` | Gobierno local de AAS válido |
| `npm audit --package-lock-only` | `FAIL` | 2 vulnerabilidades: `dompurify` 3.4.16 (crítica) e `ip-address` 10.7.3 (moderada); ver `AUD-DEP-DOMP-001` y `AUD-DEP-IPADDR-001`. Se audita el lockfile porque el `node_modules` local compartido puede estar desactualizado y producir falsos positivos |
| `npm run test:unit` | `PASS` | 243 tests superados (0 fallos) |
| `npm run test:contracts` | `PASS` | 355 tests (354 superados, 1 omitido justificado en entorno live de GitHub) |
| `npm run test:security` | `PASS` | 212 tests superados (0 fallos) |
| `npm run test:gitops` | `PASS` | 43 tests superados (0 fallos) |
| `npm run test:frontend` | `PASS` | 374 tests superados (0 fallos) |
| `npm run test:integration` | `PASS` | 48 tests superados (0 fallos) |
| `npm run test:fuzz` | `PASS` | 7 tests superados (0 fallos) |
| `npm run probe:security:egress` | `PASS` | Validación determinista de Anti-SSRF y Egress Cilium L7 |
| Retención de tags (`tag-retention.yaml`, real) | `PASS` | 3 tags remotos, los 3 retenidos por jerarquía SemVer, 0 candidatos a purga |
| Retención de GHCR (`ghcr-retention.yaml`, real, CI) | `PASS` | Ejecuciones `workflow_run` del 2026-10-22 en verde: paginación completa (2248 y 2264 versiones evaluadas), 3 releases protegidos (`v1.119.0`, `v1.118.0`, `v1.117.0`) con 6 digests, 2 imágenes obsoletas purgadas |
| Suites con render Helm (`npm test`) | `CI_REQUIRED` | Requieren `helm` o Docker; sin ellos fallan en local (`helm no disponible`). Validadas en CI al fusionar cada PR del ciclo |

---

## 3. Matriz de Hallazgos y Remediaciones Consolidadas

| ID | Área | Evidencia (`ruta:línea`) | Riesgo / Impacto | Prioridad | Confianza | Esfuerzo | Estado | Acción / Remediación |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `AUD-DEP-DOMP-001` | Dependencias / SCA | `apps/frontend/package.json:15` (`dompurify ^3.4.16`), `apps/frontend/src/sanitizer.ts:125` | Tres avisos (`GHSA-cg2g-xh64-v4q7`, `GHSA-mrv2-3pqr-j5jr`, `GHSA-c6gr-qvv4-5v3f`) sobre `<=3.4.16`, uno clasificado crítico. Dependencia de ejecución del frontend, usada para sanear HTML. La explotabilidad no está demostrada: la configuración de `sanitizer.ts` no usa `SAFE_FOR_TEMPLATES`, `IN_PLACE` ni `PARSER_MEDIA_TYPE`, que son las opciones de los tres avisos. | `P2` | `MEDIUM` | `XS` | `OPEN` | Actualizar a `dompurify 3.4.17` (publicada el 2026-10-12, ya supera `minimumReleaseAge`) con `npm update dompurify --package-lock-only`, y confirmar con `npm audit` y `test:frontend`. Valorar elevar a `P1` si se confirma alguna de las opciones afectadas. |
| `AUD-DEP-IPADDR-001` | Dependencias / SCA | `package-lock.json` (`ip-address 10.7.3`, vía `express-rate-limit` y `socks`); `apps/backend/src/middleware/rate-limiter.ts` | `GHSA-rxp7-6hxx-x8q5`: `Address6` evalúa un identificador de zona en tiempo cuadrático antes de aplicar el límite de longitud, por lo que una cadena larga puede bloquear el proceso. Se usa de forma transitiva en el limitador de tasa del backend. | `P2` | `MEDIUM` | `XS` | `OPEN` | Actualizar a `ip-address 10.7.4` (publicada el 2026-10-11) con `npm update ip-address --package-lock-only`. Verificar si `express-rate-limit` entrega a `Address6` valores controlados por el cliente. |
| `AUD-CI-PIPE-001` | CI / Fiabilidad | `.github/workflows/infra.yaml` (pasos 6 y 8 del job de Kind) | `curl ... \| grep -q` bajo `set -euo pipefail` falla de forma intermitente: `grep -q` sale en el primer acierto, `curl` recibe `SIGPIPE` (exit 23) y `pipefail` hace fallar la tubería aunque la métrica sea correcta. Reproducido en 29 de 300 iteraciones frente a 0 de 300 con captura previa. | `P3` | `HIGH` | `XS` | `CLOSED` | Captura de `/metrics` en una variable y `grep -q <<<`, y test `AUD-CI-PIPE-001` que prohíbe `curl\|wget\|kubectl logs\|gh api ... \| grep -q` en todos los workflows, en PR `#921`. La causa exacta de la ejecución fallida original es una inferencia coherente con toda la evidencia, no una reproducción directa. |
| `AUD-REL-GHCR-003` | Supply Chain / Retención OCI | `scripts/ghcr-retention.ts` (`collectReleasePinnedDigests`, `assertReleaseProtection`) | La retención solo protegía los digests de GitOps vigentes, por lo que una purga real podía eliminar las imágenes de releases anteriores y dejar sin rollback. | `P3` | `HIGH` | `S` | `CLOSED` | Se protegen las imágenes de los 3 últimos releases estables leyendo sus pines con `git show tag:archivo`; una purga real falla si no hay tags o no son legibles, en PR `#919`. Limitación conocida: las imágenes de `v1.117.0` y `v1.118.0` ya no existían en GHCR, por lo que el rollback queda garantizado desde `v1.119.0`. |
| `AUD-REL-GHCR-002` | CI / Retención OCI | `.github/workflows/ghcr-retention.yaml` | La ejecución manual podía purgar realmente por defecto. | `P3` | `HIGH` | `XS` | `CLOSED` | `dry_run` con valor por defecto `true`, con test de contrato, en PR `#918`. |
| `AUD-REL-GHCR-001` | Supply Chain / Retención OCI | `scripts/ghcr-retention.ts` | Un fallo al consultar un paquete se registraba y el script terminaba con código 0 y mensaje de éxito (fail-open, contrario a ADR-027). Además, la consulta no paginaba y evaluaba solo la primera página de versiones. | `P3` | `HIGH` | `S` | `CLOSED` | `RetentionResult.errors` y `retentionExitCode`, y paginación por cabecera `Link rel="next"` restringida a `https://api.github.com/` con tope de 100 páginas, en PR `#915` y `#917`. La primera purga real tras la paginación eliminó 18 imágenes, y la siguiente 2. |
| `AUD-REL-DRAFT-001` | Release / Higiene | `docs/operations/TAG_RETENTION_POLICY.md` §8 | La purga de tags dejaba GitHub Releases en estado *Draft*: 289 borradores sin tag ni assets. | `P3` | `MEDIUM` | `S` | `CLOSED` | Los 289 borradores se eliminaron con un script manual con copia de seguridad previa y confirmación explícita; la política documenta el comportamiento residual, en PR `#916`. Hoy hay 0 borradores. |
| `AUD-REL-RET-001` | Release / Retención | `scripts/tag-retention.ts`, `scripts/ghcr-retention.ts` | La simulación automática sin `GITHUB_TOKEN` se presentaba como ejecución real. | `P3` | `HIGH` | `S` | `CLOSED` | Cerrado en el baseline anterior (PR `#907`); sin regresión en este ciclo. |

Hallazgos cerrados consolidados de baselines anteriores (consultables en el historial de Git con `git log --stat -- docs/audits/`): `AUD-MCP-TRACE-001` (`#906`), `AUD-DEP-MDIT-001` (`#903`), `AUD-DB-CONN-001` (`#894`), `AUD-DB-PREP-001` (`#901`), `AUD-TOOL-BIOME-001` (`#896`), `AUD-GOV-EVAL-001` (`#898`), `AUD-MCP-SCAN-001` (`#899`) y `AUD-MCP-HITL-001` (`#900`).

### Decisiones y observaciones del ciclo

- **Actualización de dependencias (`#914`):** `@google/genai 2.29.1` y actualizaciones solo de lockfile (`playwright`, `zod`, `basic-ftp`, `qs`, `uuid`, `smol-toml`) respetando `minimumReleaseAge` de 7 días. El PR de Renovate `#908` se cerró por `EOVERRIDE` al combinar `overrides` de `package.json` con una actualización directa.
- **Promoción `v1.119.1`:** el PR `#920` se cerró sin fusionar. No hay cambios de comportamiento de la aplicación desde `v1.119.0`, por lo que no se considera necesaria una nueva versión.
- **Sonar:** `applyGhcrRetention` mantiene una advertencia de complejidad cognitiva (~44-45) heredada de antes del ciclo; no bloquea el Quality Gate.
- **Kind:** no se evidenció una desconexión real de la base de datos en el log de la ejecución fallida.

---

## 4. Detalle de Hallazgos Significativos (P0 / P1)

No se registraron hallazgos P0 ni P1 al cierre de este ciclo.

---

## 5. Configuration Hygiene

### 1. `.ignore inventory`

Catálogo inspeccionado mediante `scripts/check-ignore-hygiene.ts` (7 archivos, sin cambios respecto al baseline anterior):

1. `.dockerignore` (raíz).
2. `.gitignore` (raíz).
3. `.markdownlintignore` (raíz).
4. `.semgrepignore` (raíz).
5. `apps/backend/.dockerignore`.
6. `apps/frontend/.dockerignore`.
7. `infra/helm/pokedex/.helmignore`.

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
| Ramas remotas | Solo `main`. |
| Worktrees (`worktree:doctor`) | Sin huérfanos, prunables ni fuera de política. |
| Tags remotos | 3 tags, todos retenidos por jerarquía; 0 candidatos a purga. |
| Releases en borrador | 0 (los 289 residuales se eliminaron en este ciclo). |

Candidatos pendientes de aprobación humana (fase 5 del protocolo; no se ejecutan durante la auditoría):

| Candidato | Estado | Justificación |
| :--- | :--- | :--- |
| Tags locales de clones antiguos (295 en el clon auditado frente a 3 en el remoto) | `REVIEW` | Dependen de cada máquina; se sincronizan con `git fetch --prune --prune-tags`, documentado en `TAG_RETENTION_POLICY.md`. |
| Copias de seguridad `tmp/drafts-backup-*.jsonl` y temporales antiguos del checkout principal | `REVIEW` | No están versionados; pueden eliminarse localmente cuando se confirme que no se necesitan. |

---

## 7. Cambios Propuestos y Roadmap

1. **Inmediato (P0/P1):** Ninguno requerido.
2. **Medio Plazo (P2):** actualizar `dompurify` a `3.4.17` e `ip-address` a `10.7.4` solo en el lockfile (`AUD-DEP-DOMP-001`, `AUD-DEP-IPADDR-001`); ambas versiones superan ya el `minimumReleaseAge` de 7 días.
3. **Mantenimiento Continuo (P3):** valorar un reintento automático acotado para el paso `gitsign verify-tag` de `release-tag.yaml`, tras un único fallo transitorio de Rekor observado en el ciclo anterior (evidencia insuficiente para abrir un hallazgo); vigilar el job de Kind tras `#921` y abrir un hallazgo si vuelve a fallar.

---

## 8. Checklist de Verificación y Criterios de Aceptación

- [x] **Compilación & Tipado:** `npm run typecheck` en verde.
- [x] **Linters de Código:** `npm run lint` (Biome) limpio en 330 archivos.
- [x] **Gobernanza Documental & Markdown Gate:** `npm run docs:validate` y `npm run lint:md` sin fallos (155 archivos Markdown).
- [x] **Higiene de Configuración:** `npm run lint:ignore:strict` y `npm run lint:yaml:strict` en verde.
- [x] **Superficie de Testing:** `npm run test:surface:check` sincronizado (1265 casos en catálogo).
- [x] **Gobernanza de Secretos:** `npm run secrets:audit-rotation` (12/12 controles).
- [x] **Supply Chain & GitOps:** `npm run gitops:verify-parity:strict` y `npm run gitops:pin:check` certificados en `v1.119.0`.
- [ ] **Dependencias:** `npm audit --package-lock-only` reporta 2 vulnerabilidades (`AUD-DEP-DOMP-001`, `AUD-DEP-IPADDR-001`).
- [x] **Anti-SSRF & Egress:** `npm run probe:security:egress` verificado en modo determinista.
- [x] **Gobernanza de Worktrees & MCP:** `npm run worktree:doctor`, `npm run mcp:validate`, `npm run mcp:scan` y `npm run mcp:test` validados.
- [x] **Retención de Tags y GHCR:** verificadas contra el remoto real en CI, sin simulación.
- [ ] **Suites con render Helm:** `CI_REQUIRED` en local; en verde en el CI de los PRs del ciclo.
- [x] **Retención de Auditorías:** Un único baseline activo conforme a `max_active_snapshots: 1`.
