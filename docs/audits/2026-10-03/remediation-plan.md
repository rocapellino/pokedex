# Plan de Implementación de Mejoras — Auditoría 2026-10-03

> **Origen:** [baseline.md](baseline.md) (commit `b09813b`)
>
> **Estado inicial de todos los hallazgos:** `OPEN` → pasan a `PLANNED` al aprobarse este plan.
> El estado vigente se registra en issues titulados con el ID `AUD-*`, no en este archivo
> (ciclo de estados de [repo-lifecycle](../../../.agents/skills/repo-lifecycle/SKILL.md)).

---

## 1. Objetivo y Justificación Técnica

Remediar los 12 hallazgos de la auditoría con cambios pequeños, reversibles y agrupados por
dominio, para que cada PR active solo los gates de su dominio.

La clasificación con el motor determinista sobre el conjunto completo de archivos devuelve
`global (configuración transversal modificada)` y despacha Full CI. Hay dos causas:
`.github/workflows/**` y `package.json` pertenecen a `global.paths`. Por eso esos dos tipos de
cambio van aislados en sus propios PRs y no se agrega ningún script npm nuevo.

---

## 2. Alcance Detallado por PR

| PR | Hallazgos | Tipo | Dominio (matriz §4) | Skill de ejecución |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `AUD-GOV-SKL-011`, `AUD-GOV-SKL-012` | fix | Skills y reglas de agente | `repo-fix` |
| 2 | `AUD-SEC-CORS-001` | fix | GitOps declarativo | `repo-fix` |
| 3 | `AUD-SEC-CSRF-001`, `AUD-SEC-CORS-002` | fix | Backend core | `repo-fix` |
| 4 | `AUD-SEC-TLS-001` | fix + ADR | Proxy web / Ingress + GitOps | `repo-fix` + `repo-docs` |
| 5 | `AUD-WF-GOV-001` | fix | Workflows de CI/CD (global) | `repo-fix` + `repo-ci` |
| 6 | `AUD-GOV-ADR-001`, `AUD-GOV-DOC-002` | docs | Documentación pura (*Fast Track*) | `repo-docs` |
| 7 | `AUD-TST-HYG-001`, `.trivyignore` (`SECURITY_REVIEW`) | fix | Scripts + archivos de exclusión | `repo-fix` |
| — | `AUD-DEP-MAJ-001`, `AUD-TST-GOD-001` | backlog | Dependencias / calidad | `repo-modernize`, `repo-refactor` |

### PR 1 — Frontmatter de skills y CLI de frescura

- **`.agents/skills/*/SKILL.md` (9 archivos):** entrecomillar `description` en `repo-audit`,
  `repo-dependencies`, `repo-docs`, `repo-impact`, `repo-maintenance`, `repo-quality`,
  `repo-refactor`, `repo-security` y `repo-testing`.
- **`tests/skills_frontmatter.test.ts` (nuevo):** parsea con `js-yaml` el frontmatter de cada
  `SKILL.md` y exige YAML válido, `name` igual al nombre del directorio y `description` no vacía.
  Se escribe primero y debe fallar con 9 skills antes del fix.
- **`.agents/skills/repo-lifecycle/scripts/audit-freshness.ts`:** agregar bloque CLI
  (`import.meta.url === pathToFileURL(process.argv[1]).href`) que lea el baseline indicado y el
  estado real (`git rev-parse HEAD`, `package.json`, `Chart.yaml`, `targetRevision` de
  `gitops/apps/*.yaml`) e imprima el resultado. Se invoca con
  `npx tsx .agents/skills/repo-lifecycle/scripts/audit-freshness.ts <baseline.md>`.
- **`tests/audit_freshness.test.ts`:** caso nuevo que verifica que el baseline vigente se
  parsea sin `MISSING_*`.
- **`.agents/skills/repo-lifecycle/SKILL.md:220` y `.agents/skills/_shared/report-template.md`:**
  documentar el comando y fijar las tres filas que el parser espera (`package.json`, `Chart.yaml`
  y GitOps `targetRevision`).

### PR 2 — Orígenes CORS por entorno

- **`gitops/environments/proxmox/values.yaml` y `proxmox-preprod/values.yaml`:** declarar
  `api.env.corsOrigins` con los orígenes reales. Si el PR 4 todavía no está integrado, son los
  orígenes `http://` vigentes. Por ejemplo, prod usaría
  `http://pokedex.proxmox.internal.lan,http://k8s-proxmox.internal.lan`. Al integrar el PR 4 se
  cambian a `https://`.
- **`tests/gitops/` (contrato nuevo o ampliación de `gitops_architecture.test.ts`):** para
  cada entorno activo del App-of-Apps, el `corsOrigins` efectivo (base + override) no contiene
  `example.com` y cada host del ingress figura en la lista.
- **`docs/runbooks/PROXMOX_DEPLOYMENT_GUIDE.md`:** documentar el parámetro.

### PR 3 — Endurecimiento de CSRF y respuesta CORS

- **`apps/backend/src/middleware/auth.ts:139-155`:** comparar `new URL(origin).host` por
  igualdad contra `req.headers.host` o contra la lista configurada, y rechazar con 403 toda
  mutación autenticada por cookie que no traiga `Origin` ni `Referer`.
- **`apps/backend/server.ts:106-109,184`:** marcar el error CORS con una clase o código propio
  y responder 403 sin volcar el stack en el log.
- **Tests (`tests/security.test.ts` o `tests/unit/`):** `Origin: http://<host>.evil.test` → 403;
  mutación por cookie sin origen → 403; origen CORS no permitido → 403 (hoy 500).

### PR 4 — TLS en el ingress Proxmox (requiere decisión)

Antes de ejecutar, decidir entre las dos opciones de `AUD-SEC-TLS-001`:

- **Opción A (recomendada):** Traefik con entrypoint `websecure`, `tls:` con un Secret firmado
  por la CA interna (la misma que ya valida Vault) y middleware de redirección `web → websecure`.
  Toca `gitops/environments/proxmox*/values.yaml` (ingress) y, si el certificado se gestiona
  con ESO o cert-manager, `infra/`. Enmendar ADR-016 para describir Traefik en lugar de las
  anotaciones `nginx.ingress.kubernetes.io/*`.
- **Opción B (transitoria):** mantener HTTP, setear `SECURE_COOKIES=false` solo en Proxmox
  (requiere desacoplarlo de `nodeEnv` en `infra/helm/pokedex/templates/configmap.yaml:9`) y
  enmendar ADR-016 con la excepción on-prem, su riesgo aceptado y la fecha de revisión. El
  hallazgo queda `ACCEPTED_RISK`.

En ambos casos:

- **Test:** contrato en `tests/gitops/` que exija coherencia entre `SECURE_COOKIES=true` y un
  ingress con TLS en cada entorno.
- **Docs:** `docs/decisions/ADR-016-ingress-tls-and-http-hardening.md` y
  `docs/architecture/SECURITY_AND_NETWORK_ISOLATION.md`.

### PR 5 — Consumir el control `pr-governance`

- **`.github/workflows/change-impact.yaml`:** job `pr-governance` con
  `if: needs.<detect>.outputs.pr_governance == 'true' && github.event_name == 'pull_request'`,
  `permissions: { contents: read, pull-requests: read }`, actions fijadas por SHA, que ejecute
  `npm run pr:validate -- --remote "${{ github.event.pull_request.number }}"`. Incluirlo en
  `needs` del agregador `quality-gate` (`change-impact.yaml:214`).
- **`tests/ci_workflow_governance.test.ts`:** todo output `always` declarado en
  `.github/ci-impact.yaml` debe tener al menos un job consumidor.

### PR 6 — Drift documental

- **`docs/decisions/ADR-018-opentelemetry-distributed-tracing-and-w3c.md`:** sección de
  enmienda. Lo vigente es la propagación W3C `traceparent` / `X-Request-Id`; la exportación OTLP
  queda diferida porque no hay SDK y `OTEL_EXPORTER_OTLP_ENDPOINT` no se consume.
- **`docs/security/DEVSECOPS_AUDIT.md`:** aplicar
  [documentation-retirement-policy.md](../../../.agents/skills/repo-docs/references/documentation-retirement-policy.md).
  El contenido vigente se consolida en `SECURITY_RUNBOOK.md` o `docs/architecture/`, y el resto
  se retira del árbol activo. Actualizar `docs/README.md:54`.
- **`docs/README.md:56`:** reemplazar "ADR-001 a ADR-022 (y ADR-023 a ADR-027)" por una
  referencia al índice `docs/decisions/README.md`.

### PR 7 — Higiene de tests y exclusiones

- **`scripts/dr-drill.ts:137-380`:** envolver la ejecución en `try { … } finally { fs.rmSync(tempBase, …) }`.
- **`tests/security/dr_e2e_drill.test.ts`:** tras el caso que espera error (`:83`), afirmar
  que no queda `tmp/dr_drill_*` nuevo.
- **`.trivyignore` (raíz):** decidir con `repo-security` si la supresión de `AVD-AWS-0104`
  debe aplicar a todo el escaneo `fs`. Si no, retirar la copia raíz y apuntar el escaneo IaC a
  `infra/opentofu/.trivyignore`.

### Backlog (sin PR en este ciclo)

- **`AUD-DEP-MAJ-001`:** evaluación `repo-modernize` de Express 5 (cambios en `path-to-regexp`,
  manejo de promesas rechazadas y `req.query`). `@google/genai` se actualiza vía Renovate.
- **`AUD-TST-GOD-001`:** dividir `tests/security/iac_baseline_security.test.ts` por dominio
  (Ansible, OpenTofu, Helm) la próxima vez que se modifique.

---

## 3. Matriz de Riesgos y Mitigación

- **Bloquear mutaciones legítimas (PR 3):** clientes por API key (curl, CI) no envían
  cookie, así que la regla "sin origen → 403" solo aplica a cookie. Mitigación: tests para
  API key, Bearer y cookie.
- **Orígenes CORS incompletos (PR 2):** si se omite un host (por ejemplo, el acceso por IP),
  ese acceso sigue fallando. Mitigación: el contrato deriva la lista de los hosts del ingress.
- **Corte por TLS (PR 4):** un certificado no confiable en los clientes rompe el acceso.
  Mitigación: aplicar primero en pre-prod, distribuir la CA interna y mantener el rollback
  descrito abajo.
- **Falso negativo de `pr:validate` en CI (PR 5):** podría bloquear PRs de Renovate o de release
  con cuerpo automático. Mitigación: verificar el comportamiento sobre esos autores antes de
  hacerlo requerido en el ruleset.
- **Pérdida de contenido al retirar `DEVSECOPS_AUDIT.md` (PR 6):** mitigación: consolidar antes
  de retirar; Git conserva la historia.

---

## 4. Secuencia de Ejecución

1. **PR 1:** desbloquea el despacho de skills que usan los PRs siguientes.
2. **PR 2 → PR 4:** CORS primero (sin riesgo de corte) y TLS después, con pre-prod antes que
   prod. El backoffice queda operativo recién con ambos integrados.
3. **PR 3:** independiente; puede ir en paralelo al PR 2.
4. **PR 5:** aislado por ser global (Full CI).
5. **PR 6 y PR 7:** en cualquier orden, después del PR 1.
6. Cada PR sigue las fases 3 a 6 de `repo-lifecycle`: test que falla primero, actualizar
   artefactos derivados (`npm run test:surface:update` cuando se agregan tests), documentar y
   depurar.

---

## 5. Estrategia de Rollback

- **PRs 1, 3, 5, 6 y 7:** `git revert <commit>` del merge; sin estado persistente.
- **PR 2 y PR 4:** `git revert` en `gitops/` y sincronización de ArgoCD. En el PR 4 el
  rollback inmediato es restaurar `router.entrypoints: "web"` y `tls: []` en el entorno afectado.
  Ninguno requiere migración de datos ni invalidar Redis: las sesiones activas se pierden, y eso
  es aceptable.

---

## 6. Criterios de Aceptación y Checklist de Validación

Comunes a todos los PRs:

- [ ] Test de regresión del hallazgo (falla antes, pasa después)
- [ ] Regla de referencias inversas aplicada si se renombró, movió o eliminó algo
- [ ] Artefactos derivados actualizados (`npm run test:surface:update` si cambian tests)
- [ ] `npm run lint:md -- <archivos>` y `npm run docs:validate` si se tocó Markdown
- [ ] `npm run ci:detect-impact -- --files <archivos> --format markdown` adjunto al PR

Gates del dominio (tabla §4 de [change-impact-matrix.md](../../../.agents/skills/_shared/change-impact-matrix.md)):

| PR | Gates |
| :---: | :--- |
| 1 | `npm run lint:md`, `npm run docs:validate`, `npm test` (tests de gobernanza de skills) |
| 2 | `npm run gitops:pin:check`, `npm run gitops:verify-parity:strict`, `helm template` por entorno |
| 3 | `npm run lint`, `npm run build:backend`, `npm test`, `npm run test:fuzz` |
| 4 | `npm run nginx:conf:check`, `helm template` por entorno, trazado de rutas, `gitops:verify-parity:strict` |
| 5 | Validación YAML, auditoría de `permissions:`, `npm test` (`ci_workflow_governance`) |
| 6 | `npm run lint:md -- <archivos>`, `npm run docs:validate` |
| 7 | `npm test` (`dr_e2e_drill`), `npm run validate` (por el cambio en `.trivyignore`) |
