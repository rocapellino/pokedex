# Baseline Integral del Repositorio — 2026-11-24

> **Estado:** Histórico
>
> **Nota de ciclo de vida:** Snapshot de referencia de auditoría integral (`full-audit`, 16 etapas, incluyendo `configuration-hygiene`). Sustituye al baseline anterior (`2026-11-05`) tras su poda documental conforme a la política de retención (`max_active_snapshots: 1`). El estado operativo vigente se obtiene siempre desde el último commit de `main` y los gates ejecutados sobre ese árbol.

## 1. Identificación y Paridad de Versión

- **Fecha de captura:** `2026-11-24`
- **Rama base auditada:** `main`
- **Commit:** `d3bd0a6decd697be0ee08fdd663f74ac9c288f9c`
- **Release GitHub más reciente:** `v1.120.0` (`2026-11-17T13:48:57Z`)
- **Workspace de auditoría:** `C:\Users\Rodrigo\Documents\Git\.worktrees\pokedex\docs--audits-baseline-2026-11-24` (rama `docs/audits-baseline-2026-11-24`)
- **Modo de ejecución:** `full-audit` (16 etapas, incluyendo `configuration-hygiene`)

| Fuente de verdad | Versión / Revisión | Estado |
| --- | --- | --- |
| `package.json` | `1.120.0` | Sincronizada |
| `infra/helm/pokedex/Chart.yaml` (`version` / `appVersion`) | `1.120.0` | Sincronizada |
| GitOps `targetRevision` (manifiestos de `gitops/apps/`) | `v1.120.0` | Sincronizada (`app-cloud.yaml`, `app-proxmox-preprod.yaml`; `root-application.yaml` en `main`) |

## 2. Resumen Ejecutivo y Capacidades Verificadas

Auditoría integral de 16 etapas ejecutada sobre `main` (`d3bd0a6decd697be0ee08fdd663f74ac9c288f9c`, posterior al merge de PR `#1072`). No se detectaron hallazgos `P0`. Todas las puertas locales de linting, gobernanza documental, dependencias (`npm audit` con `0` vulnerabilidades), alertas de seguridad en GitHub (`0` Dependabot / `0` Code Scanning / `0` Secret Scanning) y suites unitarias/frontend/MCP/fuzzing/evals cerraron en `PASS`.

Se registran **13 hallazgos verificados** (`0 P0`, `4 P1`, `6 P2`, `3 P3`). Los 4 hallazgos `P1` requieren remediación priorizada en defensa en profundidad SSRF (`AUD-SEC-URLVAL-002`), cierre de cookie en logout (`AUD-SEC-LOGOUT-001`), aislamiento de namespace en Cilium (`AUD-INF-CILIUM-002`) y desalineación de credenciales en `ServiceMonitor` (`AUD-INF-METRICS-001`).

### Inventario del Repositorio (`d3bd0a6d`)

- **Archivos versionados (`git ls-files`):** `749`
- **Suites / archivos de prueba:** `199` archivos (`178` suites, `1319` casos, `36.321` líneas, `1512.5 KB` según `test:surface:check`)
- **Scripts operativos (`scripts/`):** `77` archivos
- **Workflows CI/CD (`.github/workflows/`):** `19` archivos
- **Skills registrados (`.agents/skills/`):** `23` directorios (`23/23` listados en `AGENTS.md` y `.agents/README.md`)
- **Marcadores `TODO` / `FIXME` / `HACK` / `XXX`:** `0`
- **Estado GitHub activo al corte:** PR `#1071` (`chore(release): promote v1.120.1 [skip-release]`) en estado `OPEN`/`BLOCKED`; único issue abierto `#586` (Renovate Dependency Dashboard).
- **Archivos TypeScript no-test de mayor tamaño:**
  - `apps/backend/src/data/initialPokemons.ts` (`1108` LOC)
  - `scripts/test-surface/metadata.ts` (`843` LOC)
  - `.agents/skills/repo-tool-exec/scripts/tool-exec.ts` (`813` LOC)
  - `scripts/generate-pokemon-catalog.ts` (`798` LOC)
  - `scripts/github-security-linear-sync.ts` (`758` LOC)

### Estado de Puertas y Suites

| Puerta / Suite | Resultado | Detalle observado |
| --- | --- | --- |
| `npm.cmd run lint` | `PASS` | `biome check .` (`358` archivos), `tsc --noEmit` en root, `@pokedex/backend` y `@pokedex/frontend` |
| `npm.cmd run lint:ignore:strict` | `PASS` | `5` archivos evaluados |
| `npm.cmd run lint:yaml:strict` | `PASS` | `0` extensiones `.yml` detectadas |
| `npm.cmd run lint:docs:refs` | `PASS` | `0` referencias obsoletas (`7` excepciones declaradas) |
| `npm.cmd run docs:validate` | `PASS` | Contratos e inventario documental consistentes |
| `npm.cmd run lint:md` | `PASS` | `143` archivos validados en `README.md`, `SECURITY.md`, `AGENTS.md`, `docs/` y `.agents/`, `0` errores |
| `npm.cmd run test:surface:check` | `PASS` | `199` archivos / `178` suites / `1319` casos registrados |
| `npm.cmd run nginx:conf:check` | `PASS` | Plantilla Nginx validada |
| `npm.cmd run build:css:check` | `PASS` | CSS compilado sincronizado |
| `npm.cmd run db:lint-migrations` | `PASS` | `1` migración verificada |
| `npm.cmd run aas:governance` | `PASS` | AAS Core `18.6.0`, `8` referencias |
| `npm.cmd run mcp:validate` | `PASS` | `9` servidores (`8` habilitados), `8` perfiles, `5` clientes |
| `npm.cmd run mcp:generate:check` | `PASS` | Sincronía verificada en `5` clientes |
| `npm.cmd run secrets:audit-rotation` | `PASS` | `12/12` secretos con metadatos de rotación |
| `npm.cmd run gitops:pin:check` | `PASS` | Pines de release en `v1.120.0` |
| `npm.cmd run lint:ruleset` | `PASS` | Ruleset GitHub consistente |
| `npm.cmd run worktree:doctor` | `PASS` | `370` archivos verificados, `0` no conformes, `0` podables |
| `tofu fmt -check -recursive infra/opentofu` | `PASS` | Formato OpenTofu limpio |
| `npm.cmd audit --json` | `PASS` | `0` vulnerabilidades (`info=0`, `low=0`, `moderate=0`, `high=0`, `critical=0`) |
| `npm.cmd run test:unit` | `PASS` | `268/268` casos |
| `npm.cmd run test:frontend` | `PASS` | `380/380` casos |
| `npm.cmd run mcp:test` | `PASS` | `48/48` casos |
| `npm.cmd run test:security` / `test:fuzz` / `evals` | `PASS` | Todas las aserciones en verde |
| `npm.cmd run test:contracts` | `CI_REQUIRED` | `354/365 PASS`, `9` skipped, `2` fallos por ausencia local de CLI `helm` en `gitops_image_parity.test.ts` |
| `npm.cmd run test:gitops` | `CI_REQUIRED` | Validación estática `PASS`; tests con renderizado Helm y daemon Docker fallan localmente por dependencias ausentes (`helm` / Docker daemon inactivo); verificado en verde en CI run `45506404994` sobre `d3bd0a6d` |

## 3. Catálogo Consolidado de Hallazgos

| ID | Severidad | Ámbito | Ubicación verificada | Resumen |
| --- | --- | --- | --- | --- |
| `AUD-SEC-URLVAL-002` | `P1` | Seguridad / Backend | `apps/backend/src/validation/network-security.ts` (`L164-L171`, `L38-L40`) | `validateImageUrl` retorna `parsed.protocol === 'https:'` cuando `isLocalhost` se cumple en `NODE_ENV=production` y conserva chequeo redundante en `L38-L40` |
| `AUD-INF-CILIUM-002` | `P1` | Infra / Cilium | `infra/helm/pokedex/templates/cilium-network-policies.yaml` (`L22-L33`) | `fromEndpoints.matchLabels` de `ingressController` omite `"k8s:io.kubernetes.pod.namespace"` permitiendo tráfico potencial cross-namespace |
| `AUD-INF-METRICS-001` | `P1` | Infra / Observabilidad | `infra/helm/pokedex/templates/servicemonitor.yaml` (`L23-L27`), `externalsecret.yaml` (`L80`) | `ServiceMonitor` apunta a `.Values.auth.metricsToken` y `key: METRICS_TOKEN` inexistentes en lugar de `.Values.externalSecrets.metricsToken` y `key: METRICS_BEARER_TOKEN` |
| `AUD-SEC-LOGOUT-001` | `P1` | Seguridad / Auth | `apps/backend/src/routes/auth.ts` (`L71-L88`) | `POST /api/auth/logout` envía `Set-Cookie` de limpieza en `L72` antes de completar `await revokeSessionTokenDetailed(token)` en `L74` |
| `AUD-CI-GATES-002` | `P2` | CI / Seguridad | `.github/workflows/security-code-scanning.yaml` (`L82`, `L106-L114`) | `hadolint` (`no-fail: true`) y `trivy-iac` (sin `exit-code: '1'`) operan en modo permisivo sin bloquear merge |
| `AUD-CI-IMPACT-002` | `P2` | CI / Impacto | `.github/ci-impact.yaml` (`L323-L332`), `scripts/lib/linear.ts` | `1/749` archivos trackeados (`scripts/lib/linear.ts`) cae en categoría `unknown` dentro de `ci-impact` |
| `AUD-CI-PUBDAG-002` | `P2` | CI / Release DAG | `.github/workflows/ci.yaml` (`L507`), `.github/workflows/change-impact.yaml` (`L257-L260`) | El job `publish` en `main` no espera la finalización de `frontend-web` ni `infra` en el grafo de dependencias |
| `AUD-INF-VALUES-001` | `P2` | Infra / Helm | `infra/helm/pokedex/values.prod.yaml` (`L175`) | `remoteRef.key` usa `"secret/data/pokedex/prod"` en vez del path sin prefijo `"pokedex/prod"` |
| `AUD-CFG-DOCKERIGN-002` | `P2` | Config / Containers | `.dockerignore` (`L40`, `L50-L64`), `apps/backend/Dockerfile` (`L29`) | Regla `*.sql*` frágil respecto a `0000_greedy_luckman.sql` y ausencias de exclusión para `taskfiles/`, `.claude/`, `.cursor/`, `docker-compose*.yaml` y `scratch/` |
| `AUD-GOV-CLEANUP-001` | `P2` | Gobernanza / Higiene | `tmp/`, `.agents/skills/_shared/change-impact-matrix.md` | `10` archivos residuales (~`930 KiB`) en `tmp/` local y `9` skills orquestadores/transversales ausentes de `change-impact-matrix.md` |
| `AUD-CFG-GITLEAKS-001` | `P3` | Config / Secret Scanning | `.gitleaks.toml` (`L27-L32`, `L48`) | Clasificado `SECURITY_REVIEW`: `4` rutas inexistentes en allowlist y excepción `minioadmin_secure_password` sin nota de gobernanza `CLEAN-001` |
| `AUD-IAC-LXC-001` | `P3` | IaC / OpenTofu | `infra/opentofu/environments/proxmox/main.tf` (`L26`) | `unprivileged = false` carece de comentario inline documentando la excepción operativa |
| `AUD-SCR-TESTS-001` | `P3` | Scripts / Validación | `scripts/cleanup-linear-tickets.ts`, `scripts/list-linear-issues.ts`, `apps/backend/src/validation/ai-security.ts` (`L31-L35`) | Dos scripts CLI de Linear sin cobertura directa de tests; regex de sanitización IA sin decodificación previa de entidades HTML |

## 4. Detalle Técnico de Hallazgos Prioritarios (`P1`)

### `AUD-SEC-URLVAL-002` — Política localhost en `validateImageUrl`

- **Ubicación:** `apps/backend/src/validation/network-security.ts` (`L38-L40` y `L164-L171`).
- **Evidencia verificada:** En modo `NODE_ENV=production`, cuando el host evaluado cumple `isLocalhost`, la función devuelve `parsed.protocol === 'https:'` en lugar de rechazar explícitamente orígenes `localhost` en producción. Adicionalmente, `L38-L40` mantiene un chequeo redundante de protocolo.
- **Acción recomendada:** Rechazar explícitamente `localhost` y loopback en `NODE_ENV=production` independientemente del esquema y eliminar la comprobación duplicada en `L38-L40`.

### `AUD-INF-CILIUM-002` — Aislamiento de namespace en `CiliumNetworkPolicy`

- **Ubicación:** `infra/helm/pokedex/templates/cilium-network-policies.yaml` (`L22-L33`).
- **Evidencia verificada:** El bloque `fromEndpoints.matchLabels` para `ingressController` filtra por etiquetas de controlador sin fijar `"k8s:io.kubernetes.pod.namespace"`, ampliando la superficie permitida a cualquier namespace que porte la etiqueta coincidente.
- **Acción recomendada:** Incluir `"k8s:io.kubernetes.pod.namespace": {{ .namespace | quote }}` en `matchLabels` del origen `ingressController`.

### `AUD-INF-METRICS-001` — Desalineación de token en `ServiceMonitor`

- **Ubicación:** `infra/helm/pokedex/templates/servicemonitor.yaml` (`L23-L27`) frente a `infra/helm/pokedex/templates/externalsecret.yaml` (`L80`).
- **Evidencia verificada:** `ServiceMonitor` referencia `.Values.auth.metricsToken` y la clave `METRICS_TOKEN`, mientras que `ExternalSecret` materializa `.Values.externalSecrets.metricsToken` bajo la clave `METRICS_BEARER_TOKEN`.
- **Acción recomendada:** Unificar `servicemonitor.yaml` para consumir el secreto sincronizado con clave `METRICS_BEARER_TOKEN` y habilitar su cobertura bajo `.Values.externalSecrets.metricsToken`.

### `AUD-SEC-LOGOUT-001` — Orden de invalidación de cookie y revocación de sesión

- **Ubicación:** `apps/backend/src/routes/auth.ts` (`L71-L88`).
- **Evidencia verificada:** La ruta de logout ejecuta `res.setHeader('Set-Cookie', buildLogoutCookie())` en `L72` antes de esperar `await revokeSessionTokenDetailed(token)` en `L74`. Si ocurre un fallo antes de persistir la revocación o cambia el flujo de respuesta, la cabecera ya quedó emitida.
- **Acción recomendada:** Ejecutar primero `await revokeSessionTokenDetailed(token)` y emitir `Set-Cookie` solo tras confirmar o manejar explícitamente el resultado de la revocación.

## 5. Trazabilidad End-to-End de Rutas y Entornos

Se trazó el flujo HTTP completo (`Ingress` -> `Nginx` -> `Backend` -> `PostgreSQL` / migraciones) a lo largo de los 4 entornos activos:

| Entorno | Fuente de configuración | Trazabilidad verificada | Observaciones |
| --- | --- | --- | --- |
| Desarrollo local / CI | `apps/frontend/nginx.conf.template`, `apps/backend/server.ts`, `apps/backend/src/db/migrate.ts` | `/api/*` proxied hacia backend Express; `/healthz`, `/readyz` y `/metrics` resuelven correctamente | Paridad de esquema SQL garantizada por `drizzle` (`0000_greedy_luckman.sql`) |
| Docker Compose / Containers | `apps/frontend/Dockerfile`, `apps/backend/Dockerfile` | `COPY` de artefactos compilados y carpeta de migraciones `.sql` al runtime final | Afectado por fragilidad de patrón `*.sql*` (`AUD-CFG-DOCKERIGN-002`) |
| Proxmox Preprod (GitOps) | `gitops/environments/proxmox-preprod/values.yaml`, `gitops/apps/app-proxmox-preprod.yaml` | `targetRevision: v1.120.0`; Ingress TLS + Cilium + ExternalSecrets alineados con chart `1.120.0` | Afectado por `AUD-INF-CILIUM-002` y `AUD-INF-METRICS-001` |
| Cloud / Prod (GitOps) | `gitops/environments/cloud/values.yaml`, `infra/helm/pokedex/values.prod.yaml`, `gitops/apps/app-cloud.yaml` | `targetRevision: v1.120.0`; Ingress y probes consistentes con runtime Express | `values.prod.yaml` presenta prefijo Vault duplicado `secret/data/` (`AUD-INF-VALUES-001`) |

## 6. Configuration Hygiene

Auditoría dedicada sobre archivos de configuración, exclusiones, políticas estáticas, toolchains y superficie residual del repositorio usando la taxonomía oficial (`KEEP`, `KEEP_IMPROVE`, `REMOVE`, `REVIEW`, `SECURITY_REVIEW`).

### 6.1 Inventario Descubierto Dinámicamente

Se inspeccionaron los `9` archivos de exclusión y políticas estáticas presentes en el árbol versionado:

- `.gitignore`
- `.dockerignore`
- `.markdownlintignore`
- `.semgrepignore`
- `infra/helm/pokedex/.helmignore`
- `.gitleaks.toml`
- `.github/zizmor.yaml`
- `.checkov.yaml`
- `.kube-linter.yaml`

### 6.2 Matriz de Exclusiones y Seguridad

| Archivo | Estado | Evidencia / Hallazgo | Acción recomendada |
| --- | --- | --- | --- |
| `.gitignore` | `KEEP` | Cubre artefactos Node, builds, `tmp/`, envfiles y llaves locales sin ocultar código productivo | Mantener sin cambios |
| `.dockerignore` | `KEEP_IMPROVE` | `AUD-CFG-DOCKERIGN-002`: usa `*.sql*` pese al `COPY` de migraciones en `apps/backend/Dockerfile:L29` y omite `taskfiles/`, `.claude/`, `.cursor/`, `docker-compose*.yaml` y `scratch/` | Negar explícitamente `!apps/backend/src/db/migrations/*.sql` y añadir exclusiones faltantes |
| `.markdownlintignore` | `KEEP` | Excluye únicamente reportes/generados fuera de gobierno (`node_modules`, builds) | Mantener sin cambios |
| `.semgrepignore` | `KEEP` | Sin supresiones sobre código de runtime productivo | Mantener sin cambios |
| `infra/helm/pokedex/.helmignore` | `KEEP` | Excluye test suites y metadatos locales fuera del paquete Helm | Mantener sin cambios |
| `.gitleaks.toml` | `SECURITY_REVIEW` | `AUD-CFG-GITLEAKS-001`: `4` rutas inexistentes en allowlist (`L27-L32`) y excepción `minioadmin_secure_password` (`L48`) sin referencia `CLEAN-001` | Depurar rutas huérfanas y documentar trazabilidad de la excepción tras validación de seguridad |
| `.github/zizmor.yaml` | `KEEP` | Reglas de análisis GitHub Actions acotadas y justificadas | Mantener sin cambios |
| `.checkov.yaml` | `KEEP` | Supresiones mínimas documentadas para manifests de infraestructura | Mantener sin cambios |
| `.kube-linter.yaml` | `KEEP` | Política de Kubernetes consistente con plantillas Helm vigentes | Mantener sin cambios |

### 6.3 Validación de Contextos de Build Docker

- `apps/backend/Dockerfile`: copia `package.json`, `dist/` y migraciones SQL (`L29`), expone salud HTTP y ejecuta bajo usuario no-root. Riesgo bajo de ruptura si `.dockerignore` bloquea variantes `.sql*` sin excepción explícita para `apps/backend/src/db/migrations/*.sql`.
- `apps/frontend/Dockerfile`: compilación multi-stage con salida estática servida por Nginx con `nginx.conf.template`; las exclusiones actuales en `.dockerignore` no bloquean assets ni plantillas requeridas.

### 6.4 Dependencias, Overrides y Paridad de Workspace

- `npm.cmd audit --json`: `0` vulnerabilidades reportadas (`total: 0`).
- `overrides` declarados en root (`12` entradas) resuelven de manera determinista en `package-lock.json` (`zod@4.6.7`, `js-yaml@5.5.0`, `minimatch@11.0.4`/`3.1.5`, `glob@14.0.3`/`7.2.3`, `re2js@2.9.1`, `basic-ftp@6.2.5`).
- `0` discrepancias de versión entre workspaces (`@pokedex/backend`, `@pokedex/frontend`, raíz).

### 6.5 Skills, Matriz de Impacto y Higiene de Workspace (`tmp/`)

- **Registro de skills:** `23/23` skills declarados en `AGENTS.md` y `.agents/README.md`.
- **Brecha documental (`KEEP_IMPROVE` / `AUD-GOV-CLEANUP-001`):** `9` skills orquestadores o transversales no figuran en `.agents/skills/_shared/change-impact-matrix.md`.
- **Directorio temporal local (`REMOVE` / `AUD-GOV-CLEANUP-001`):** `10` archivos residuales no trackeados en `tmp/` locales (~`930 KiB`); ningún archivo supera guardrails ni requiere borrado automático destructivo fuera de limpieza controlada.
- **Worktrees:** `npm.cmd run worktree:doctor` reporta `0` entradas no conformes y `0` podables tras la limpieza previa.

### 6.6 Políticas IaC, CI Security y Cobertura de Scripts

- `infra/opentofu/environments/proxmox/main.tf` (`L26`): `REVIEW` (`AUD-IAC-LXC-001`) por `unprivileged = false` sin comentario justificativo inline.
- `.github/workflows/security-code-scanning.yaml` (`L82`, `L106-L114`): `KEEP_IMPROVE` (`AUD-CI-GATES-002`) por `hadolint` (`no-fail: true`) y `trivy-iac` sin `exit-code: '1'`.
- `.github/ci-impact.yaml` (`L323-L332`): `KEEP_IMPROVE` (`AUD-CI-IMPACT-002`) por `scripts/lib/linear.ts` en categoría `unknown`.
- `scripts/cleanup-linear-tickets.ts` y `scripts/list-linear-issues.ts`: `KEEP_IMPROVE` (`AUD-SCR-TESTS-001`) sin suite unitaria directa.

### 6.7 Resumen de Clasificación `Configuration Hygiene`

| Taxonomía | Cantidad | Elementos clasificados |
| --- | --- | --- |
| `KEEP` | `7` | `.gitignore`, `.markdownlintignore`, `.semgrepignore`, `infra/helm/pokedex/.helmignore`, `.github/zizmor.yaml`, `.checkov.yaml`, `.kube-linter.yaml` |
| `KEEP_IMPROVE` | `5` | `.dockerignore` (`AUD-CFG-DOCKERIGN-002`), `security-code-scanning.yaml` (`AUD-CI-GATES-002`), `.github/ci-impact.yaml` (`AUD-CI-IMPACT-002`), `change-impact-matrix.md` (`AUD-GOV-CLEANUP-001`), scripts Linear (`AUD-SCR-TESTS-001`) |
| `REMOVE` | `1` | Residuos locales en `tmp/` (`10` archivos ~`930 KiB`, `AUD-GOV-CLEANUP-001`) |
| `REVIEW` | `1` | `infra/opentofu/environments/proxmox/main.tf:L26` (`AUD-IAC-LXC-001`) |
| `SECURITY_REVIEW` | `1` | `.gitleaks.toml` (`AUD-CFG-GITLEAKS-001`) |

## 7. Remediación Sugerida y Siguiente Ciclo

1. **Prioridad alta (`P1` — Remediación inmediata recomendada):**
   - Corregir `validateImageUrl` en `apps/backend/src/validation/network-security.ts` (`AUD-SEC-URLVAL-002`).
   - Invertir orden de revocación y cookie en `apps/backend/src/routes/auth.ts` (`AUD-SEC-LOGOUT-001`).
   - Restringir namespace en `infra/helm/pokedex/templates/cilium-network-policies.yaml` (`AUD-INF-CILIUM-002`).
   - Alinear `METRICS_BEARER_TOKEN` en `infra/helm/pokedex/templates/servicemonitor.yaml` (`AUD-INF-METRICS-001`).
2. **Prioridad media (`P2` — Endurecimiento CI/Infra/Higiene):**
   - Activar modo bloqueante en `hadolint` y `trivy-iac` (`AUD-CI-GATES-002`), ajustar dependencias de `publish` en CI (`AUD-CI-PUBDAG-002`) y clasificar `scripts/lib/linear.ts` en `.github/ci-impact.yaml` (`AUD-CI-IMPACT-002`).
   - Corregir `remoteRef.key` en `values.prod.yaml` (`AUD-INF-VALUES-001`), refinar `.dockerignore` (`AUD-CFG-DOCKERIGN-002`), completar `change-impact-matrix.md` y purgar `tmp/` (`AUD-GOV-CLEANUP-001`).
3. **Prioridad baja (`P3` — Trazabilidad y pruebas):**
   - Revisar `.gitleaks.toml` con flujo de seguridad (`AUD-CFG-GITLEAKS-001`), documentar excepción LXC (`AUD-IAC-LXC-001`) y cubrir scripts CLI de Linear y decodificación HTML en `ai-security.ts` (`AUD-SCR-TESTS-001`).

## 8. Checklist de Verificación y Criterios de Aceptación

- [x] `max_active_snapshots: 1` cumplido tras poda de `docs/audits/2026-11-05`
- [x] Paridad `1.120.0` verificada en `package.json`, `Chart.yaml` y manifiestos `gitops/apps/`
- [x] Enlace en `docs/README.md` actualizado a `./audits/2026-11-24/baseline.md`
- [x] Reporte con todas las categorías `P1`–`P3`, trazabilidad de entornos y `Configuration Hygiene` completa
- [x] Gates locales ejecutados sin clasificar fallos por herramientas ausentes (`helm`/Docker) como `PASS` (`CI_REQUIRED` verificado en CI run `45506404994`)
- [x] Contrato `audit-freshness.ts`, `lint:md`, `docs:validate` y tests de gobernanza documental validados sobre la versión final
