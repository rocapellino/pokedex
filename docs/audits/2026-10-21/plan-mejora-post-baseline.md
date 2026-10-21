# Plan de Mejora Posterior al Baseline 2026-10-21

> **Estado:** Histórico (documento auxiliar de planificación; se poda cuando el siguiente baseline lo absorba)
>
> **Fecha de captura:** 2026-10-21
>
> **Baseline de origen:** [baseline.md](baseline.md) (commit `0952a31a`, release `v1.118.0`)
>
> [!IMPORTANT]
> Este documento es evidencia histórica y de planificación. No es SSOT: el estado vigente
> reside en `apps/`, `infra/`, `gitops/`, `scripts/`, `tests/` y `docs/architecture/`.
> Cada ítem debe reverificarse contra el código antes de ejecutarse.

---

## 1. Alcance y Criterio

El baseline cerró con 0 hallazgos abiertos, por lo que este plan **no remedia defectos**: recoge brechas de verificación y de higiene que la auditoría dejó a la vista, con evidencia observada. No incluye `drizzle-zod`, el ajuste de pool ni `prepare: false`, descartados en el baseline.

Prioridad según impacto y esfuerzo (`XS` a `L`). Ningún ítem es `P0` ni `P1`.

| ID | Ítem | Prioridad | Esfuerzo | Skill responsable |
| :--- | :--- | :---: | :---: | :--- |
| `PLAN-01` | Retención de tags: purga manual pendiente de 6 tags remotos | `P3` | `XS` | `repo-maintenance` |
| `PLAN-02` | Propagar `TRACEPARENT` a los procesos hijo de la gobernanza MCP | `P3` | `XS` | `repo-fix` |
| `PLAN-03` | Acotar el crecimiento de `tmp/mcp-audit.jsonl` | `P3` | `XS` | `repo-fix` |
| `PLAN-04` | Decidir el comportamiento local de las suites con render Helm | `P3` | `S` | `repo-testing` |
| `PLAN-05` | Promoción de release `v1.119.0` pendiente de fusión | `P3` | `XS` | `repo-release` |
| `PLAN-06` | Investigar la divergencia entre `node_modules` y el lockfile | `P3` | `XS` | `repo-dependencies` |

---

## 2. Ítems

### PLAN-01: Retención de tags: purga manual pendiente de 6 tags remotos

- **Estado:** verificado el 2026-10-21; solo queda una decisión humana.
- **Evidencia:** el baseline ejecutó `npm run tags:retention` sin `GITHUB_TOKEN`, y el script pasa entonces a simulación automática (`[Simulación] Se evaluarán 20 tags sintéticos locales`), por lo que no verificó tags reales. Con `GITHUB_TOKEN` en modo `--dry-run` el inventario real es de 9 tags remotos (`v1.113.3` a `v1.118.0`): 3 se retienen por jerarquía (`v1.118.0`, `v1.117.0`, `v1.116.3`) y 6 son candidatos a purga (`v1.116.2`, `v1.116.1`, `v1.116.0`, `v1.115.0`, `v1.114.2`, `v1.113.3`). La única referencia protegida es `v1.118.0`.
- **Contexto:** `.github/workflows/tag-retention.yaml` audita en dry-run cada domingo; la purga real (`--no-dry-run`) es una ruta manual del workflow. Los 6 candidatos no son un defecto, sino la purga que nadie ha ejecutado.
- **Acción:**
  1. Decidir si se ejecuta la purga real desde el workflow, tras comprobar que ninguno de los 6 tags está referenciado por un GitHub Release, GitOps o Helm.
  2. Hacer que `tags:retention` falle de forma explícita (o avise en una línea destacada) cuando cae a simulación por falta de token, para que un baseline no pueda registrar una simulación como verificación.
  3. Documentar en `TAG_RETENTION_POLICY.md` que los clones locales (294 tags frente a 9 en el remoto) se sincronizan con `git fetch --prune --prune-tags`.
- **Criterio de aceptación:** el baseline siguiente registra un resultado sobre tags reales y el aviso de simulación no puede pasar inadvertido.

### PLAN-02: Propagar `TRACEPARENT` a los procesos hijo de la gobernanza MCP

- **Evidencia:** `scripts/mcp/doctor.ts` lanza procesos hijo (`trivy plugin list`, `trivy <plugin> --help`) con `execFileSync` sin definir `env`, y `withMcpAudit` crea el contexto W3C pero solo lo escribe en el log. Los hijos no reciben el `traceparent`.
- **Acción:** que `withMcpAudit` exponga `TRACEPARENT` en `process.env` mientras dura la operación y lo restaure al terminar, con un test unitario en `tests/unit/mcp/mcp_audit_hitl.test.ts`.
- **Criterio de aceptación:** un proceso hijo lanzado dentro de `withMcpAudit` observa el `traceparent` de la operación; fuera de ella, el entorno queda como estaba.

### PLAN-03: Acotar el crecimiento de `tmp/mcp-audit.jsonl`

- **Evidencia:** `recordMcpAudit` solo añade líneas (`appendFileSync`) y no hay rotación ni límite de tamaño.
- **Acción:** rotar a `tmp/mcp-audit.1.jsonl` al superar un umbral (por ejemplo 1 MB), conservando un único archivo anterior, con test.
- **Criterio de aceptación:** el log nunca supera el umbral más una operación y la rotación no rompe la escritura concurrente de dos CLIs.

### PLAN-04: Decidir el comportamiento local de las suites con render Helm

- **Evidencia:** sin `helm` ni Docker, `npm test` local falla en las suites con render (`helm no disponible`, 40 fallos observados). En CI el modo estricto sin fallback es intencional.
- **Opciones:** (a) mantener el fallo y añadir una comprobación previa en `Taskfile.yaml` con un mensaje accionable; (b) omitir las suites localmente solo cuando `CI !== 'true'`, sin tocar el comportamiento de CI.
- **Recomendación:** (a), porque (b) puede ocultar regresiones en una máquina de desarrollo.
- **Criterio de aceptación:** el fallo local indica en una línea qué instalar o iniciar, y CI conserva el modo estricto.

### PLAN-05: Promoción de release `v1.119.0` pendiente de fusión

- **Estado:** verificado el 2026-10-21; solo queda una decisión humana.
- **Evidencia:** el PR `#902` se cerró a las 17:14 UTC y lo sustituyó el PR `#904` (misma rama `release/promote-v1.119.0`, abierto a las 17:19 UTC). `#904` promueve el commit `13680f1e`, que coincide con la cabeza actual de `main`. El cierre fue una regeneración por commits posteriores, no un abandono.
- **Acción:** fusionar `#904` cuando el equipo decida cortar `v1.119.0`, y verificar después la paridad de `package.json`, `Chart.yaml` y `targetRevision`.
- **Criterio de aceptación:** `npm run gitops:pin:check` y `npm run gitops:verify-parity:strict` en verde tras la promoción.

### PLAN-06: Investigar la divergencia entre `node_modules` y el lockfile

- **Evidencia:** `npm ls markdown-it` informó `extraneous` mientras `npm audit --package-lock-only` y `package-lock.json` sí lo contenían (dependencia transitiva de `markdownlint-cli`, rango `~14.3.0`).
- **Acción:** reproducir en un clon limpio con `npm ci`. Si la divergencia es solo del entorno local, cerrar el ítem; si es del lockfile, tratarlo con `repo-dependencies`.
- **Criterio de aceptación:** `npm ls` sin `extraneous` tras `npm ci` en un clon limpio.

---

## 3. Orden Sugerido

1. `PLAN-02` y `PLAN-03` juntos, en un solo PR sobre `scripts/mcp/audit.ts`.
2. `PLAN-01` (aviso de simulación) en un PR aparte sobre `scripts/tag-retention.ts`; la purga y `PLAN-05` esperan decisión humana.
3. `PLAN-04` y `PLAN-06` después, según decisión sobre la opción de `PLAN-04`.

## 4. Verificación

Cada PR derivado de este plan ejecuta `devsecops-preflight` y los gates de [baseline.md](baseline.md) afectados. El plan se poda cuando el siguiente baseline refleje sus resultados.
