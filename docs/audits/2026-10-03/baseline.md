# Auditoría Integral (`full-audit`) — Baseline 2026-10-03

> **Estado:** Histórico (snapshot inmutable; su frescura se evalúa con `audit-freshness.ts`)
>
> **Fecha de captura:** 2026-10-03
>
> **Commit:** `b09813bbad2954c4f097728fac8cdb8c2c975da5`
>
> **Rama auditada:** `refactor/skills-lifecycle` (sobre `main` en `f50c277`, release `v1.89.17`)
>
> [!IMPORTANT]
> Este documento es evidencia histórica del commit auditado. No es SSOT: el estado vigente
> reside en `apps/`, `infra/`, `gitops/`, `scripts/`, `tests/` y `docs/architecture/`.
> El estado de cada hallazgo se sigue fuera del snapshot (issue con título `AUD-*`).

**Repositorio:** `rocapellino/pokedex`
**Contexto Operativo:** Monorepo (`apps/backend`, `apps/frontend`) | Entornos: Kind / Proxmox Pre-prod / Proxmox Prod / AWS EKS (referencia inactiva)
**Vocabulario de estados:** gates según [state-model.md](../../../.agents/skills/_shared/state-model.md) §3 (`PASS`, `FAIL`, `NOT_EXECUTED`, `CI_REQUIRED`); higiene de configuración con 5 estados (`KEEP`, `KEEP_IMPROVE`, `REMOVE`, `REVIEW`, `SECURITY_REVIEW`).

---

## 1. Identificación y Paridad de Versión

| Componente | Valor auditado | Fuente |
| :--- | :--- | :--- |
| `package.json` | `1.89.17` | Versión de aplicación y monorepo |
| `infra/helm/pokedex/Chart.yaml` (`version` / `appVersion`) | `1.89.17` | Empaquetado Helm |
| GitOps `targetRevision` (4 manifiestos de `gitops/apps/`) | `v1.89.17` | Promoción ArgoCD |
| Último tag | `v1.89.17` | `git tag --sort=-v:refname` |

Frescura del baseline anterior (`2026-10-02`): `AUDIT_STALE` (no bloqueante) con diferencias
`HEAD`, `PACKAGE_VERSION`, `CHART_VERSION` y `MISSING_GITOPS_REVISION`. La última diferencia no
proviene de una divergencia real sino del formato del snapshot (ver `AUD-GOV-SKL-012`).

---

## 2. Resumen Ejecutivo

- **Total de Hallazgos:** `12`
- **P0 (Crítico):** `0`
- **P1 (Alto):** `3`
- **P2 (Medio):** `4`
- **P3 (Bajo):** `5`

Todos los gates automáticos están en verde. Los tres P1 escaparon a esos gates: dos surgen del
trazado de rutas en los entornos Proxmox y uno del catálogo de skills. Conforme a
[methodology.md](../../../.agents/skills/_shared/methodology.md) §1, los gates en `PASS` no
certifican ausencia de defectos.

### Gates automáticos

| Gate | Estado | Observación |
| :--- | :--- | :--- |
| `npm test` | `PASS` | 472 tests: 471 pasan y 1 se omite (`RULESET-001`, requiere `RULESET_LIVE_CHECK=1`) |
| `npm run typecheck` | `PASS` | |
| `npm run lint` | `PASS` | |
| `npm run docs:validate` | `PASS` | |
| `npm run lint:md` | `PASS` | 0 errores `MDxxx` |
| `npm run gitops:verify-parity` | `PASS` | |
| `npm run gitops:pin:check` | `PASS` | |
| `npm run lint:ignore` | `PASS` | 9 archivos evaluados |
| `npm run lint:yaml` | `PASS` | |
| `npm run lint:ruleset` | `PASS` | |
| `npm run test:surface:check` | `PASS` | |
| `npm run nginx:conf:check` | `PASS` | |
| `npm audit` (completo y `--omit=dev`) | `PASS` | 0 vulnerabilidades |
| `npm run test:e2e` / `test:a11y` | `NOT_EXECUTED` | Requiere navegador y stack levantado |
| Runtime en clúster | `NOT_EXECUTED` | Sin acceso a los clústeres Proxmox desde la sesión |

### Superficie técnica

| Métrica | Valor |
| :--- | :---: |
| Workflows en `.github/workflows/` | 18 |
| Scripts en `scripts/` | 23 |
| Skills en `.agents/skills/` | 18 |
| Archivos versionados en `tests/` | 56 |
| ADRs activos en `docs/decisions/` | 24 |

---

## 3. Matriz de Hallazgos

| ID | Área | Evidencia (`ruta:línea`) | Riesgo / Impacto | Prioridad | Confianza | Esfuerzo | Recomendación |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| `AUD-SEC-CORS-001` | Seguridad / GitOps | `infra/helm/pokedex/values.yaml:52`, `apps/backend/server.ts:106-109` | En Proxmox, `CORS_ORIGINS` vale `https://pokedex.example.com`; toda mutación desde el navegador (login, CRUD del backoffice) responde 500 | P1 | HIGH (render) / MEDIUM (runtime) | S | Declarar `api.env.corsOrigins` por entorno en `gitops/environments/*/values.yaml` y un test que lo exija |
| `AUD-SEC-TLS-001` | Seguridad / ADR Drift | `gitops/environments/proxmox/values.yaml:58-60,115`, `apps/backend/src/middleware/auth.ts:79`, `docs/decisions/ADR-016-ingress-tls-and-http-hardening.md:33-36` | Ingress HTTP sin TLS mientras `NODE_ENV=production` emite cookie `Secure`; el navegador descarta la sesión y las credenciales viajan en claro. ADR-016 exige TLS y redirección 308 | P1 | HIGH | M | Terminar TLS en Traefik (`websecure` + certificado) o enmendar ADR-016 con la excepción on-prem |
| `AUD-GOV-SKL-011` | Skills | `.agents/skills/repo-docs/SKILL.md:3` (y 8 skills más) | 9 de 18 `SKILL.md` tienen frontmatter YAML inválido; el despacho condicional pierde la descripción (`repo-docs: repo-docs`) | P1 | HIGH | XS | Entrecomillar `description` y agregar un test que parsee el frontmatter |
| `AUD-WF-GOV-001` | CI/CD | `.github/ci-impact.yaml:19`, `.github/workflows/change-impact.yaml:48` | El control `always` `pr-governance` se calcula pero ningún job lo consume; `npm run pr:validate` no corre en CI | P2 | HIGH | S | Agregar un job que ejecute `pr:validate --remote <número>` condicionado a ese output |
| `AUD-SEC-CSRF-001` | Seguridad / App | `apps/backend/src/middleware/auth.ts:139,144` | El chequeo de origen usa `originHost.includes(req.headers.host)` (subcadena) y omite la validación si falta `Origin`/`Referer` | P2 | HIGH | S | Comparar `URL.host` por igualdad y rechazar mutaciones por cookie sin origen |
| `AUD-GOV-ADR-001` | Docs / ADR Drift | `docs/decisions/ADR-018-opentelemetry-distributed-tracing-and-w3c.md:52,65` | ADR-018 (Aceptado) describe exportación OTLP; no existe SDK OpenTelemetry en `apps/*/package.json` | P2 | HIGH | XS | Enmendar ADR-018: propagación W3C vigente, exportación OTLP diferida |
| `AUD-GOV-SKL-012` | Skills / Tooling | `.agents/skills/repo-lifecycle/SKILL.md:220`, `.agents/skills/repo-lifecycle/scripts/audit-freshness.ts:30` | La skill ordena "ejecutar" un módulo sin punto de entrada CLI; su parser espera una fila GitOps `targetRevision` que el baseline anterior no tenía | P2 | HIGH | S | Agregar CLI (`npm run audit:freshness`) y fijar el formato en la plantilla de baseline |
| `AUD-SEC-CORS-002` | App | `apps/backend/server.ts:184-196` | Un rechazo CORS termina en el handler genérico: 500 y stack en el log en vez de 403 | P3 | HIGH | XS | Mapear el error CORS a 403 sin stack |
| `AUD-TST-HYG-001` | Tests / Higiene | `scripts/dr-drill.ts:137,376-380` | `runDrDrill` limpia `tmp/dr_drill_*` solo en el camino feliz; `npm test` dejó 2 directorios residuales | P3 | HIGH | XS | Envolver el cuerpo en `try/finally` |
| `AUD-GOV-DOC-002` | Docs | `docs/security/DEVSECOPS_AUDIT.md:4`, `docs/README.md:54,56` | Snapshot fechado fuera de `docs/audits/`; el portal cita "ADR-001 a ADR-022" aunque ADR-021/022 se consolidaron | P3 | HIGH | S | Consolidar o mover el snapshot y corregir el portal |
| `AUD-DEP-MAJ-001` | Dependencias | `npm outdated` | `express` 4 → 5 y `@types/express` 4 → 5 disponibles; `@google/genai` 2.21 → 2.27 | P3 | HIGH | M | Evaluar con `repo-modernize`; `@types/node` 22 se mantiene alineado al runtime |
| `AUD-TST-GOD-001` | Calidad / Tests | `tests/security/iac_baseline_security.test.ts` (1089 líneas), `scripts/test-surface.ts` (988) | Hotspots que concentran contratos heterogéneos | P3 | MEDIUM | M | Dividir por dominio cuando se toquen |

---

## 4. Detalle de Hallazgos Significativos (P0 / P1)

### `AUD-SEC-CORS-001` Orígenes CORS de placeholder en los entornos Proxmox

- **Área:** Seguridad de aplicación / GitOps
- **Prioridad:** `P1`
- **Confianza:** `HIGH` en el render; `MEDIUM` en runtime (sin acceso al clúster)
- **Esfuerzo:** `S`
- **Evidencia:**
  - `infra/helm/pokedex/values.yaml:52` → `corsOrigins: "https://pokedex.example.com"`.
  - `gitops/environments/proxmox/values.yaml` y `gitops/environments/proxmox-preprod/values.yaml` no sobrescriben `api.env.corsOrigins`; `gitops/apps/app-proxmox*.yaml` no pasan `parameters`.
  - `infra/helm/pokedex/templates/configmap.yaml:20` renderiza `CORS_ORIGINS` desde ese valor.
  - `apps/backend/server.ts:106-109`: un `Origin` fuera de la lista invoca `callback(new Error(...))`, que el handler de `server.ts:184` convierte en 500.
- **Estado actual:** los navegadores envían `Origin` en todo `POST`, también en el mismo origen. Las llamadas de `apps/frontend/src/shared/api.ts:102,112,134` (sesión, logout y alta) llegan con `Origin: http://pokedex.proxmox.internal.lan` y se rechazan. Los `GET` del catálogo no envían `Origin` y funcionan, lo que oculta la falla.
- **Riesgo/impacto:** backoffice inutilizable desde el navegador en pre-prod y prod.
- **Recomendación:** declarar `api.env.corsOrigins` con los hosts reales de cada entorno (incluido `k8s-*.internal.lan` si se usa) y un contrato en `tests/gitops/` que falle si un entorno activo hereda un dominio `example.com`.
- **Verificación:** `helm template` por entorno sin `example.com` en `CORS_ORIGINS`; login desde el navegador en pre-prod.
- **Impacto en documentación:** `docs/runbooks/PROXMOX_DEPLOYMENT_GUIDE.md` (pendiente).

### `AUD-SEC-TLS-001` Ingress Proxmox sin TLS con cookie `Secure` (ADR Drift de ADR-016)

- **Área:** Seguridad / Arquitectura
- **Prioridad:** `P1` (`ADR Drift`)
- **Confianza:** `HIGH`
- **Esfuerzo:** `M`
- **Evidencia:**
  - `gitops/environments/proxmox/values.yaml:58-60`: `className: "traefik"` con `router.entrypoints: "web"`; `:115` `tls: []`. Pre-prod es idéntico (`:60`, `:116`).
  - `infra/helm/pokedex/templates/configmap.yaml:9`: `SECURE_COOKIES=true` cuando `nodeEnv=production`, el valor por defecto que heredan ambos entornos.
  - `apps/backend/src/middleware/auth.ts:79,89-90`: la cookie de sesión agrega `Secure`.
  - `docs/decisions/ADR-016-ingress-tls-and-http-hardening.md:33-36` (Aceptado): TLS con cert-manager y redirección 308 vía anotaciones `nginx.ingress.kubernetes.io/*`, que Traefik ignora.
- **Estado actual:** la aplicación se publica por HTTP plano. Los navegadores descartan una cookie `Secure` emitida sobre un origen no seguro, por lo que aun corregido `AUD-SEC-CORS-001` la sesión no persistiría. La API key y la sesión viajan sin cifrar por la LAN.
- **Riesgo/impacto:** credenciales administrativas en claro y backoffice sin sesión. ADR-016 no refleja el ingress real de los entornos activos.
- **Recomendación:** opción A, TLS en Traefik (`websecure`, certificado de la CA interna ya usada por Vault, redirección `web → websecure`). Opción B, enmendar ADR-016 con una excepción on-prem explícita y ajustar `SECURE_COOKIES` por entorno. Se recomienda A; B solo como medida transitoria documentada.
- **Verificación:** `helm template` con bloque `tls:` y entrypoint `websecure`; `curl -I http://...` devuelve 308; la cookie se conserva en el navegador.
- **Impacto en documentación:** `docs/decisions/ADR-016-ingress-tls-and-http-hardening.md` y `docs/architecture/SECURITY_AND_NETWORK_ISOLATION.md` (pendiente).

### `AUD-GOV-SKL-011` Frontmatter YAML inválido en 9 skills

- **Área:** Gobernanza de skills
- **Prioridad:** `P1`
- **Confianza:** `HIGH`
- **Esfuerzo:** `XS`
- **Evidencia:** `js-yaml` rechaza el frontmatter de `repo-audit`, `repo-dependencies`, `repo-docs`, `repo-impact`, `repo-maintenance`, `repo-quality`, `repo-refactor`, `repo-security` y `repo-testing` (`incomplete explicit mapping pair`). Causa: `description:` sin comillas que contiene dos puntos seguidos de un espacio (por ejemplo `.agents/skills/repo-docs/SKILL.md:3`, "Fase 5 (Documentar): mantener…"). Claude Code muestra `repo-docs`, `repo-maintenance` y `repo-quality` sin descripción.
- **Estado actual:** el despacho condicional de [AGENTS.md](../../../AGENTS.md) §3 depende de esas descripciones; ningún gate valida el frontmatter. El hallazgo surge del commit `b09813b`, que expuso las skills a Claude Code.
- **Riesgo/impacto:** skills que no se disparan o se disparan mal; comportamiento distinto según la tolerancia del parser de cada agente.
- **Recomendación:** entrecomillar `description` (o usar `>-`) y agregar en `tests/` un contrato que parsee el frontmatter de cada `SKILL.md` y exija `name` igual al directorio y `description` no vacía.
- **Verificación:** el nuevo test falla antes del fix y pasa después; las 18 skills se listan con descripción.
- **Impacto en documentación:** Ninguno.

---

## 5. Trazado de Rutas por Entorno

| Entorno | Cliente → Ingress | Ingress → Servicio | Handler | Resultado |
| :--- | :--- | :--- | :--- | :--- |
| Proxmox Prod | `http://pokedex.proxmox.internal.lan` (Traefik `web`, sin TLS) | `/api/`, `/pokemons` → `pokemon-api-svc:3000`; `/` → `pokemon-web-svc:8080` | Express (`server.ts`) | `GET` funciona; `POST` con `Origin` → 500 (`AUD-SEC-CORS-001`); cookie `Secure` descartada (`AUD-SEC-TLS-001`) |
| Proxmox Pre-prod | `http://pokedex.preprod.proxmox.internal.lan` (Traefik `web`, sin TLS) | Igual a prod | Express | Mismo resultado que prod |
| Kind | Sin GitOps propio; valores por defecto del chart | Igual | Express | No trazado contra runtime (`NOT_EXECUTED`) |
| AWS EKS | Referencia inactiva (fuera del App-of-Apps) | — | — | `NOT_APPLICABLE` |

Los nombres de servicio del ingress (`pokemon-api-svc`, `pokemon-web-svc`) coinciden con
`infra/helm/pokedex/templates/api-deployment.yaml:4` y `web-service.yaml:4`.

---

## 6. Cambios Propuestos y Roadmap de Corrección

El plan ejecutable está en [remediation-plan.md](remediation-plan.md).

1. **Inmediato (P1):** `AUD-GOV-SKL-011`, `AUD-SEC-CORS-001` y `AUD-SEC-TLS-001`.
2. **Medio plazo (P2):** `AUD-WF-GOV-001`, `AUD-SEC-CSRF-001`, `AUD-GOV-ADR-001` y `AUD-GOV-SKL-012`.
3. **Mejoras opcionales (P3):** `AUD-SEC-CORS-002`, `AUD-TST-HYG-001`, `AUD-GOV-DOC-002`, `AUD-DEP-MAJ-001` y `AUD-TST-GOD-001`.

---

## 7. Configuration Hygiene

### 1. `.ignore inventory`

| Archivo | Reglas activas | Gate |
| :--- | :---: | :---: |
| `.gitignore` | 92 | `PASS` |
| `.dockerignore` | 71 | `PASS` |
| `apps/backend/.dockerignore` | 33 | `PASS` |
| `apps/frontend/.dockerignore` | 31 | `PASS` |
| `infra/helm/pokedex/.helmignore` | 25 | `PASS` |
| `.semgrepignore` | 13 | `PASS` |
| `.markdownlintignore` | 12 | `PASS` |
| `.trivyignore` | 2 | `PASS` |
| `infra/opentofu/.trivyignore` | 2 | `PASS` |

No existe `.gitleaksignore`; las excepciones de Gitleaks se gobiernan en `.gitleaks.toml`.

### 2. Obsolete rules

Ninguna detectada por `npm run lint:ignore`.

### 3. Missing rules

Ninguna. `tmp/` y `/.claude/skills` están cubiertos en `.gitignore`.

### 4. Overbroad rules

`.semgrepignore:39` excluye `infra/` completo. La exclusión está justificada en el propio archivo
(líneas 35-38): Checkov, Trivy y kube-linter cubren IaC.

### 5. Security-sensitive exclusions

`.trivyignore` e `infra/opentofu/.trivyignore` contienen las mismas dos reglas
(`AVD-AWS-0104`, `AWS-0104`, egress de security groups de EKS). La copia raíz aplica al escaneo
`fs` de todo el repositorio (`.github/workflows/security-trivy.yaml:32-33`) y por lo tanto suprime
la regla también fuera de `infra/opentofu/`.

### 6. Cross-configuration consistency

`.dockerignore` raíz y por app excluyen `.env`, `.git`, `node_modules` y `/tmp/`; coherente con
`apps/*/Dockerfile` y con `.gitignore`.

### 7. Recommended changes

| Archivo | Clasificación | Acción |
| :--- | :--- | :--- |
| `.gitignore`, `.dockerignore` (x3), `.helmignore`, `.markdownlintignore` | `KEEP` | Ninguna |
| `.semgrepignore` | `KEEP` | Reevaluar si se agrega código ejecutable bajo `infra/` |
| `.trivyignore` (raíz) | `SECURITY_REVIEW` | Acotar la supresión a `infra/opentofu/` o justificar el alcance global |
| `infra/opentofu/.trivyignore` | `KEEP_IMPROVE` | Fuente única de la excepción si se retira la copia raíz |

---

## 8. Checklist de Verificación y Criterios de Aceptación

- [x] **Tests unitarios e integración:** `npm test` en `PASS` (0 fallos).
- [x] **Tipado y lint:** `npm run typecheck` y `npm run lint` en `PASS`.
- [ ] **Compilación:** `npm run build` en `NOT_EXECUTED` (fuera del alcance read-only).
- [x] **Paridad GitOps:** `npm run gitops:verify-parity` en `PASS`.
- [ ] **Rotación de secretos:** `npm run secrets:audit-rotation` en `NOT_EXECUTED`.
- [ ] **Pipelines de CI/CD:** `CI_REQUIRED` para E2E, a11y, Trivy, ZAP y Semgrep.
- [x] **Documentación:** `npm run docs:validate` y `npm run lint:md` en `PASS`.
