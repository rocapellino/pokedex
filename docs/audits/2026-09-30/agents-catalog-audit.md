# Auditoría del Catálogo de Skills del Agente (`.agents/`)

> **Estado:** Evidencia histórica de auditoría. No constituye SSOT del estado actual.
> **Fecha de captura:** 2026-09-30
> **Commit:** `71b2902718ee8835d61892e5dae5dd58888d4602`
> **Rama:** `fix/ide-problems` (idéntica a `main` y `origin/main`)
> **Alcance:** `.agents/` completo (54 archivos). Modo read-only, sin escrituras.
>
> [!IMPORTANT]
> La verdad operativa de este repositorio se extrae exclusivamente de `gitops/`, `infra/`,
> `docs/architecture/`, `apps/`, `scripts/` y `tests/`. Este documento congela el estado
> del corpus de skills en el commit indicado y **no** debe usarse para derivar rutas,
> versiones o configuración vigente.

---

## 1. Resumen Ejecutivo

- **Total de hallazgos:** 10
- **P0 (Crítico):** 0
- **P1 (Alto):** 3
- **P2 (Medio):** 3
- **P3 (Bajo):** 4

**Conclusión:** no se recomienda limpieza agresiva. El corpus está mejor gobernado de lo
que supone un análisis inicial: posee tests de contrato (`tests/ci_impact.test.ts`),
wiring en CI (`.github/ci-impact.yaml` incluye `.agents/**` en la regla `documentation`) y
allowlists ejecutables en `scripts/aas-governance.ts`. Los defectos son de **vocabulario y
jerarquía**, no de archivos huérfanos.

Superficie auditada: 18 skills, 10 contratos compartidos, 19 referencias normativas,
1 regla global y 4 artefactos AAS. `repo-lifecycle/SKILL.md` concentra 23.316 bytes
(1,84× el segundo archivo mayor del directorio).

---

## 2. Matriz de Hallazgos

| ID | Área | Evidencia | Riesgo / Impacto | P | Conf. | Esf. | Acción |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| `AUD-GOV-SKL-001` | `_shared` / motor | `change-impact-matrix.md:98` vs `.github/ci-impact.yaml:26-34` | Las 18 skills aprenden un modelo **incorrecto** del motor de impacto | P1 | HIGH | XS | Corregir el documento canónico |
| `AUD-GOV-SKL-002` | `repo-docs` | `SKILL.md` (7 estados) vs `references/documentation-drift.md:55-64` (8) | Taxonomía de drift no agregable; contradicción interna | P1 | HIGH | M | Reconciliar y unificar |
| `AUD-GOV-SKL-003` | `rules` | `ssot-governance.md:14` lista `src/` | Referencia huérfana a ruta inexistente | P1 | HIGH | XS | Eliminar `src/` de la tabla |
| `AUD-GOV-SKL-004` | Core | `README.md:51` + `repo-audit/SKILL.md:26` | Entrada mutua `lifecycle → audit → lifecycle` no documentada | P2 | HIGH | S | Documentar la frontera |
| `AUD-GOV-SKL-005` | `repo-lifecycle` | `SKILL.md:77-188` (32,6% del archivo) | Mega-skill: dominio `*.ignore` mezclado con orquestación | P2 | HIGH | M | Extraer a `references/` |
| `AUD-GOV-SKL-006` | `_shared` / `rules` | Tres tablas SSOT no equivalentes | Autoridad difusa para agentes | P2 | HIGH | S | Tabla única de autoridad |
| `AUD-GOV-SKL-007` | Core | `repo-lifecycle/SKILL.md:225` | Nombre de skill fantasma | P3 | HIGH | XS | Renombrar a capacidad interna |
| `AUD-GOV-SKL-008` | `repo-context` | `SKILL.md:22,30` vs `:34` | Modo mutante bajo skill declarada read-only | P3 | HIGH | XS | Etiquetar modo `UPDATE` |
| `AUD-GOV-SKL-009` | `.agents/aas` | `README.md:24` vs `:44` | Destino desconectado de su productor bloqueado | P3 | MEDIUM | XS | Enlazar ambos estados |
| `AUD-GOV-SKL-010` | `_shared` | `methodology.md:62-68` | Hechos volátiles replicados en 3 sitios | P3 | MEDIUM | S | Enlazar a `docs/architecture/` |

---

## 3. Detalle de Hallazgos P1

### `AUD-GOV-SKL-001` El contrato compartido describe incorrectamente el motor de impacto

- **Área:** `.agents/skills/_shared/change-impact-matrix.md`
- **Prioridad:** P1 | **Confianza:** HIGH | **Esfuerzo:** XS
- **Evidencia:** `change-impact-matrix.md:98`; `.github/ci-impact.yaml:26-34`;
  `repo-lifecycle/SKILL.md:305-306`
- **Estado actual:** La tabla de gating condicional clasifica los archivos de exclusión
  (`.*ignore`) como **"Nivel Global"** con la columna "Gates Exentos" fijada en
  *"Ninguno (Nivel Global)"*. `repo-lifecycle/SKILL.md:305-306` lo corrige con un callout
  que afirma que los `*.ignore` describen *los gates a ejecutar, no el disparador del
  motor*. La verificación contra el contrato real confirma la corrección: `global.paths`
  contiene exactamente 8 entradas y **ninguna** es un archivo `.*ignore`; `.dockerignore`
  aparece bajo la regla `docker` y `.markdownlintignore` bajo `documentation`, ambas por
  dominio.
- **Riesgo/impacto:** El documento canónico —consumido por las 18 skills y citado por
  `AGENTS.md:43`— enseña un modelo equivocado del motor. Cualquier skill que dimensione
  un cambio en archivos `.*ignore` puede sobreestimar el radio de impacto. La rectificación
  vive únicamente en una skill de dominio, por lo que se pierde en cuanto no se lee ese
  archivo.
- **Recomendación:** Sustituir la etiqueta "Nivel Global" por la distinción real
  *gates ejecutados vs. disparador del motor*, replicando en el documento compartido la
  aclaración de `repo-lifecycle:305-306`.
- **Verificación:** Contraste de la fila `.*ignore` contra `global.paths` de
  `.github/ci-impact.yaml`; `npm run ci:detect-impact` sobre un cambio ficticio en
  `.gitignore` debe clasificarlo por dominio, no como global.
- **Impacto en documentación:** `.agents/skills/_shared/change-impact-matrix.md` (pendiente)

### `AUD-GOV-SKL-002` `repo-docs` declara 7 estados y su referencia define 8

- **Área:** `.agents/skills/repo-docs/`
- **Prioridad:** P1 | **Confianza:** HIGH | **Esfuerzo:** M
- **Evidencia:** `repo-docs/SKILL.md` (sección `documentation-analysis`);
  `repo-docs/references/documentation-drift.md:55-64`
- **Estado actual:** `SKILL.md` enuncia *"Clasificación en los 7 estados canónicos:
  `CURRENT`, `OUTDATED`, `HISTORICAL`, `DUPLICATE`, `ORPHANED`, `INVALID`,
  `NEEDS_REVIEW`"*. Su propio `references/documentation-drift.md` §3 define **8** estados
  distintos: `CURRENT`, `STALE`, `CONTRADICTED`, `MISSING`, `HISTORICAL`, `UNKNOWN`,
  `NOT_APPLICABLE`, `PENDING_PROMOTION`. Solo se solapan `CURRENT` y `HISTORICAL`;
  `OUTDATED` y `STALE` son sinónimos con definiciones divergentes.
- **Riesgo/impacto:** Un hallazgo de drift no puede clasificarse de forma unívoca. La
  divergencia se propaga a `repo-pr` y al gate de gobernanza documental. La causa raíz
  es más amplia que este archivo: el corpus contiene **nueve vocabularios de estado**
  sin registro ni tabla de mapeo (detalle en la sección 4).
- **Recomendación:** Elegir un conjunto canónico, alinear `SKILL.md` y su referencia, y
  publicar el registro de taxonomías con su dominio de aplicación.
- **Verificación:** `npm test` y `npm run lint:md` sin incidencias.
- **Impacto en documentación:** `.agents/skills/repo-docs/SKILL.md` y
  `references/documentation-drift.md` (pendiente)

### `AUD-GOV-SKL-003` `rules/ssot-governance.md` referencia una ruta inexistente

- **Área:** `.agents/rules/ssot-governance.md`
- **Prioridad:** P1 | **Confianza:** HIGH | **Esfuerzo:** XS
- **Evidencia:** `ssot-governance.md:14`; `Test-Path src` → `False`
- **Estado actual:** La tabla de demarcación declara como **SSOT Actual** la ruta
  `` `src/`, `apps/`, `scripts/` ``. El directorio `src/` **no existe** en la raíz. Los
  directorios reales son `.agents`, `.devcontainer`, `.github`, `.vscode`, `apps`,
  `coverage`, `docs`, `gitops`, `infra`, `node_modules`, `scratch`, `scripts`, `tests`.

---

## 4. Análisis de Taxonomías (causa raíz de `AUD-GOV-SKL-002`)

El corpus mantiene nueve vocabularios de estado sin registro canónico:

| Taxonomía | Ubicación | Volumen |
| :--- | :--- | :---: |
| Drift documental (SKILL) | `repo-docs/SKILL.md` | 7 |
| Drift documental (referencia) | `repo-docs/references/documentation-drift.md` §3 | 8 |
| Volatilidad de afirmaciones | `repo-doc-governance/references/documentation-drift-policy.md` §2 | 8 |
| Severidad de drift | `idem` §3 | 4 |
| Higiene de archivos ignorados | `repo-lifecycle/SKILL.md` §5 | 5 |
| Estrategia de pruebas | `repo-lifecycle/SKILL.md:208` | 12 |
| Scripts y mantenimiento | `repo-lifecycle/SKILL.md:224` | 8 |
| Ciclo de vida de capacidad | `_shared/state-model.md` §2 | 7 |
| Niveles de despliegue | `_shared/state-model.md` §1 | 4 |

Los dominios son legítimamente distintos; el defecto es la **ausencia de un registro que
declare cuál aplica a cada dominio**. Sin él, una auditoría de skills no puede asignar un
estado canónico sin inventarlo.

> [!NOTE]
> Clasificar skills con el vocabulario de higiene de configuración (`KEEP`,
> `KEEP_IMPROVE`, `REMOVE`, `REVIEW`) es un ejemplo del problema: ese dominio no aplica a
> skills y su uso obliga a inventar estados ad hoc.

---

## 5. Hallazgos P2 y P3 (resumen operativo)

- **`AUD-GOV-SKL-004` (P2)** — `README.md:51` sitúa `repo-audit` como paso 2 del flujo de
  `repo-lifecycle`, mientras `repo-audit/SKILL.md:26` ejecuta el `full-audit` de
  `repo-lifecycle`. La entrada es mutua y no está documentada. **No hay recursión
  infinita:** las 16 etapas del `full-audit` no reentran en `repo-audit`. Falta
  explicitar la frontera, no romperla.
- **`AUD-GOV-SKL-005` (P2)** — `repo-lifecycle/SKILL.md` ocupa 23.316 bytes (344 líneas);
  las líneas 77-188 (32,6%) son normativa pura del dominio `*.ignore`. Es además la
  **única skill con código ejecutable** (`scripts/audit-freshness.ts`, importado por
  `tests/audit_freshness.test.ts:4`), lo que rompe la homogeneidad del catálogo.
- **`AUD-GOV-SKL-006` (P2)** — Existen tres definiciones de SSOT no equivalentes:
  `AGENTS.md` sección 1, `rules/ssot-governance.md` y `_shared/source-of-truth.md` (que
  usa un eje distinto: 11 dominios de información, sin la demarcación de `docs/audits/`).
- **`AUD-GOV-SKL-007` (P3)** — `repo-skills-audit` aparece **una sola vez** en 384
  archivos (`repo-lifecycle/SKILL.md:225`) y no existe. Causa raíz identificada:
  conflacción con la referencia upstream `project-skill-audit` de AAS, que la allowlist
  de `scripts/aas-governance.ts:16` ya asigna a `repo-lifecycle`. La Opción A del análisis
  inicial es por tanto el contrato ya declarado.
- **`AUD-GOV-SKL-008` (P3)** — `repo-context` ofrece mutar `AGENTS.md` (`:22`, `:30`)
  bajo una metodología declarada *read-only* (`:34`). Atenuante: `methodology.md:103`
  contiene la válvula *"salvo orden explícita del usuario"*.
- **`AUD-GOV-SKL-009` (P3)** — `.agents/aas/plans/` solo contiene `.gitkeep`;
  `scripts/aas-governance.ts` lee únicamente los dos JSON y nunca toca `plans/`. No es un
  descuido: es el destino declarado de un flujo `BLOCKED`/`NOT_CONFIGURED` que además no
  debe materializar. La redacción del README no enlaza ambos estados.
- **`AUD-GOV-SKL-010` (P3)** — `methodology.md:62-68` replica hechos volátiles (Node 22,
  topología Proxmox LXC 800 / VM 801) presentes también en `repo-context/SKILL.md:15-20`
  y en el bloque `profile` de `aas-stack.json`. La SSOT es `docs/architecture/`.

---

## 6. Hallazgos Negativos (verificados y conformes)

- `.agents/aas/` está correctamente gobernado: allowlist hardcodeada en
  `scripts/aas-governance.ts`, suite `tests/aas_governance.test.ts`, cableado en
  `.github/workflows/ci.yaml` y regla `agent_governance` en `ci-impact.yaml`. **No es
  documentación decorativa.**
- `.agents/skills/` **no es código inerte**: `tests/ci_impact.test.ts:747` verifica que el
  `full-audit` de `repo-lifecycle` enumera etapas contiguas, y `:783` recorre todo
  `.agents/` fallando ante referencias a la extensión obsoleta `.yml`.
- `.agents/rules/ssot-governance.md` es coherente con `AGENTS.md` en su principio de
  demarcación; el defecto es de completitud, no de fondo.
- `.agents/skills/_shared/` evita correctamente la repetición de reglas entre `SKILL.md`.

---

## 7. Restricciones para la Remediación

> [!WARNING]
>
> 1. `tests/ci_impact.test.ts:747` (**SKILL-001**) exige que el `full-audit` de
>    `repo-lifecycle` declare exactamente tantas etapas como enumera, y que toda mención
>    textual a "N etapas" coincida. Cualquier edición de ese flujo **debe preservar el
>    conteo de 16** o CI fallará.
> 2. `tests/ci_impact.test.ts:783` prohíbe citar workflows con extensión `.yml` en
>    cualquier archivo bajo `.agents/`.
> 3. `AGENTS.md` sección 2 impone `npm run lint:md` con 0 errores `MDxxx` sobre todo `.md`
>    creado o modificado; deshabilitar reglas está prohibido.

---

## 8. Comandos de Verificación Reproducibles

```bash
# P1-001: el motor no declara ningún .*ignore como global
Select-String -Path .github/ci-impact.yaml -Pattern 'ignore'

# P1-003: referencia huérfana
Test-Path src

# P2-005: peso relativo de la mega-skill
Get-Item .agents/skills/repo-lifecycle/SKILL.md | Select-Object Length

# P3-007: skill fantasma
Select-String -Path .agents/skills/repo-lifecycle/SKILL.md -Pattern 'repo-skills-audit'
```

---

## 9. Criterios de Aceptación de la Remediación

- [ ] `npm run lint:md` reporta 0 errores `MDxxx` en los archivos modificados
- [ ] `npm test` pasa, en particular los tests **SKILL-001**
- [ ] `npm run aas:verify` sigue validando la allowlist AAS
- [ ] La tabla de `change-impact-matrix.md` refleja `global.paths` real
- [ ] Un solo vocabulario de drift documental en `repo-docs`
- [ ] Ninguna referencia a rutas inexistentes en las reglas de agentes

  El código fuente vive en `apps/backend/src/` y `apps/frontend/src/`. Además, `tests/`
  se menciona en la prosa de la sección 2.2 pero **no figura en la tabla**, mientras
  `AGENTS.md` sección 1 sí lo incluye.
- **Riesgo/impacto:** Referencia huérfana en la regla que gobierna la autoridad de todas
  las demás: un agente puede buscar `src/` en la raíz, no encontrarla y concluir que el
  código fuente está ausente. Es exactamente la clase `ORPHANED_REFERENCE` que
  `repo-docs` existe para detectar.
- **Recomendación:** Sustituir `src/` por `apps/` y añadir `tests/` a la fila de código
  fuente, alineando la tabla con `AGENTS.md` sección 1.
- **Verificación:** `Test-Path src` → `False` y diff exacto contra la tabla de `AGENTS.md`.
- **Impacto en documentación:** `.agents/rules/ssot-governance.md` (pendiente)
